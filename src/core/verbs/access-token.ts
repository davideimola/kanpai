import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";

// The tokens the MCP door takes, as records (ADR-0009).
//
// What is here is the credential as the owner holds it: issued under a name, shown once,
// stored only as a hash, revoked one by one, with a last-used time. What is **not** here is
// the `Authorization` header that carries one — reading a header is the door's business, in
// `src/lib/mcp/bearer.ts`, and this file never sees a request.
//
// The secret is `kanpai_` and 32 random bytes in base64url: 256 bits, which nobody guesses
// at any rate a door can be asked, and a prefix that says what it is when it turns up in a
// shell history or a secret scanner. Only its SHA-256 reaches the database.
//
// **Looking a token up by its hash is the constant-time comparison.** An index lookup on
// `secret_hash` returns faster or slower depending on how much of the *hash* matched, and a
// hash that half-matches says nothing about a secret that would produce it: the caller
// controls the hash only through a preimage. So there is no `timingSafeEqual` here, and none
// is needed — tsundoku's door hashes both sides for the same reason, to compare digests
// rather than secrets.

/** What the owner is shown once, when a token is issued, and never again. */
export type IssuedToken = {
  id: string;
  name: string;
  /** The secret to paste into the client. Kept nowhere: lose it and issue another. */
  secret: string;
  createdAt: Date;
};

/** Who is calling, once the door has let them in. */
export type Caller = { tokenId: string; name: string };

/**
 * Why a secret was not let in. For the server's log only: the caller gets one 401 whatever
 * the reason, because which mistake it was is information they have not earned.
 */
export type TokenRefusal =
  /** Nothing is live, so nothing can be right. A fresh copy before its first token. */
  | "none-issued"
  /** No live or revoked token has this secret. */
  | "unknown"
  /** It was a token, and the owner revoked it. */
  | "revoked";

export type TokenCheck = { ok: true; caller: Caller } | { ok: false; refusal: TokenRefusal };

const PREFIX = "kanpai_";

/** The SHA-256 of a secret, in hex: what the database holds instead of it. */
function hashOf(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

const NO_SUCH_TOKEN = "No access token has that id.";

/**
 * Issue a token named after where it is going — *Claude*, *laptop*, *tunnel* — and return
 * its secret, the one time it exists outside the client it is pasted into.
 *
 * A name already carried by a live token is refused: two *Claude*s would leave the owner
 * unable to tell which one to revoke. A revoked token's name is free again.
 */
export async function issueAccessToken(name: string): Promise<IssuedToken> {
  const secret = `${PREFIX}${randomBytes(32).toString("base64url")}`;

  const [row] = await refusing(
    () =>
      query<{ id: string; name: string; createdAt: Date }>(
        `insert into access_tokens (name, secret_hash) values ($1, $2)
         returning id, name, created_at as "createdAt"`,
        [name.trim(), hashOf(secret)]
      ),
    (constraint) => {
      switch (constraint) {
        case "access_tokens_name_is_unique_while_live":
          return "A live token already has that name. Revoke it first, or choose another.";
        case "access_tokens_name_is_not_blank":
          return "A token has a name: where it is going, like Claude or laptop.";
        default:
          return "That token could not be issued.";
      }
    }
  );
  if (!row) throw new Error("insert into access_tokens returned no row");
  return { ...row, secret };
}

/**
 * Revoke a token: from now on the door refuses it, and nothing else changes. The row stays,
 * with when it was last used. Revoking one already revoked is refused, so the owner learns
 * they named the wrong one.
 */
export async function revokeAccessToken(tokenId: string): Promise<void> {
  const updated = await query(
    `update access_tokens set revoked_at = now()
      where id = $1 and revoked_at is null
      returning id`,
    [tokenId]
  );
  if (updated.length > 0) return;

  const found = await query("select 1 from access_tokens where id = $1", [tokenId]);
  throw found.length === 0
    ? new Refusal("not-found", NO_SUCH_TOKEN)
    : new Refusal("not-allowed", "That token is already revoked.");
}

/**
 * Whether a secret is a live token, and whose. A live one has its last-used time touched —
 * at most once a minute, so a conversation of thirty calls is one write and not thirty.
 *
 * **Fails closed** with no help from here: with no token issued nothing matches, and every
 * request is refused. `none-issued` only tells the log why.
 */
export async function authenticateAccessToken(secret: string): Promise<TokenCheck> {
  const [found] = await query<{ id: string; name: string; revoked: boolean }>(
    `with found as (
       select id, name, revoked_at is not null as revoked
         from access_tokens
        where secret_hash = $1
     ),
     touched as (
       update access_tokens t
          set last_used_at = now()
         from found f
        where t.id = f.id
          and not f.revoked
          and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute')
       returning t.id
     )
     select id, name, revoked from found`,
    [hashOf(secret)]
  );

  if (found && !found.revoked) return { ok: true, caller: { tokenId: found.id, name: found.name } };
  if (found) return { ok: false, refusal: "revoked" };

  const live = await query("select 1 from access_tokens where revoked_at is null limit 1");
  return { ok: false, refusal: live.length === 0 ? "none-issued" : "unknown" };
}
