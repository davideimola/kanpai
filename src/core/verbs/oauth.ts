import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { hashOf, newSecret } from "./access-token.ts";

// kanpai as its own OAuth 2.1 authorization server, for the one resource it has: `/mcp`
// (ADR-0013).
//
// What is here is the model of it, in four records and the moves between them:
//
//   - an **app** registers itself (`registerOAuthClient`) — anyone may, so that grants nothing;
//   - the owner presses *Allow* and a **code** is issued for it (`issueAuthorizationCode`),
//     five minutes long, single use, bound to the app's PKCE challenge;
//   - the app redeems the code for a **grant** (`redeemAuthorizationCode`): the owner's yes,
//     holding one refresh token, and the first access token under it;
//   - the app trades the refresh token for a new one and a new access token every hour
//     (`refreshGrant`), until the owner — or the app — revokes the grant (`revokeGrant`,
//     `revokeBySecret`), which takes every access token under it with it.
//
// **The access tokens are rows in `access_tokens`**, the table the door already checks
// (ADR-0009): an OAuth access token is the owner's kind of token with a grant and an hour to
// live, and `authenticateAccessToken` lets both in by the same query. That is why there is no
// second check on `/mcp` and why this file never reads a header — the protocol's HTTP is
// `src/lib/oauth/`, and what comes back from here is a verdict it maps to RFC 6749's words.
//
// Every secret is stored as its SHA-256 (`hashOf`), looked up by it, and so compared in
// constant time for the reason `./access-token.ts` gives. The one comparison that is *not* a
// lookup — the PKCE verifier against the challenge — uses `timingSafeEqual`.

/** How long an access token lives. An hour: short enough that a leaked one goes stale on its own. */
export const ACCESS_TOKEN_LIFE_IN_SECONDS = 60 * 60;

/** How long a code waits to be redeemed. The app redeems it the moment it lands, in a second. */
const CODE_LIFE_IN_SECONDS = 5 * 60;

/** What an app is called when it does not say. Shown on the consent screen and on `/settings`. */
export const UNNAMED_CLIENT = "An assistant";

/** As long as a name can be and still fit on one line of the consent screen. */
const NAME_LENGTH = 100;

/** Enough for any real client — ChatGPT registers one, Claude two — and no flood of them. */
const REDIRECT_URIS = 10;

const ACCESS_PREFIX = "kanpai_at_";
const REFRESH_PREFIX = "kanpai_rt_";

/** An app, once registered: what RFC 7591 says to hand back. */
export type RegisteredClient = {
  clientId: string;
  name: string;
  redirectUris: string[];
  issuedAt: Date;
};

/** What an app holds after a code or a refresh token is redeemed. */
export type Granted = {
  grantId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

/**
 * Why a code or a refresh token was not redeemed. For the log only: the app is told
 * `invalid_grant` whichever it was (RFC 6749 §5.2), and an app that is not registered at all is
 * the door's to refuse before it gets here.
 */
export type GrantRefusal =
  /** No code has this secret. */
  | "unknown-code"
  /** The code was redeemed before. The grant that first use produced is revoked now. */
  | "code-reused"
  /** The code waited longer than five minutes. */
  | "code-expired"
  /** The code or refresh token was issued to another app. */
  | "wrong-client"
  /** The redirect address is not the one the code was sent to. */
  | "wrong-redirect"
  /** The PKCE verifier does not produce the challenge the app sent first. */
  | "pkce-failed"
  /** No live grant holds this refresh token — never issued, or rotated past. */
  | "unknown-refresh"
  /** The grant the refresh token belongs to was revoked. */
  | "grant-revoked";

export type GrantVerdict = { ok: true; granted: Granted } | { ok: false; refusal: GrantRefusal };

/**
 * What is wrong with a redirect address, in a sentence, or `null` when nothing is.
 *
 * **https, or http to this machine only** — OAuth 2.1 §2.3.1 and the MCP authorization spec:
 * a code sent over plain http anywhere else is a code anyone on the path can redeem, and it is
 * the code, not the page, that the owner's yes is. Loopback is the exception because nothing
 * crosses a network to reach it, which is what a desktop client or the MCP inspector uses.
 *
 * No fragment, because a code appended to an address with one is lost in it (RFC 6749 §3.1.2).
 */
export function redirectUriProblem(uri: string): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `${uri} is not a web address.`;
  }
  if (uri.length > 2000) return "A redirect address is at most 2000 characters.";
  if (url.hash !== "" || uri.includes("#"))
    return `${uri} has a fragment, and a code would be lost in it.`;
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return null;
  return `${uri} is neither https nor http to localhost.`;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Register an app (RFC 7591): a name and where a code may be sent back.
 *
 * **A registration grants nothing.** Anyone may call it — that is what makes Dynamic Client
 * Registration work with an app nobody configured — so a row here is a name the consent screen
 * will show and a list of addresses, and access starts only when the owner presses *Allow*.
 * The name is the app's own claim and is shown as one, next to where it will send the owner.
 *
 * Public clients only: no secret is issued, and an app that asked for one is registered
 * without (the door says so in its answer, as RFC 7591 §3.2.1 lets the server decide).
 */
export async function registerOAuthClient(asked: {
  name?: string | null;
  redirectUris: readonly string[];
}): Promise<RegisteredClient> {
  if (asked.redirectUris.length === 0) {
    throw new Refusal("invalid", "Register at least one redirect address.");
  }
  if (asked.redirectUris.length > REDIRECT_URIS) {
    throw new Refusal("invalid", `Register at most ${REDIRECT_URIS} redirect addresses.`);
  }
  for (const uri of asked.redirectUris) {
    const problem = redirectUriProblem(uri);
    if (problem) throw new Refusal("invalid", problem);
  }

  const name = nameOf(asked.name);
  const [row] = await refusing(
    () =>
      query<{ id: string; name: string; redirectUris: string[]; createdAt: Date }>(
        `insert into oauth_clients (name, redirect_uris) values ($1, $2)
         returning id, name, redirect_uris as "redirectUris", created_at as "createdAt"`,
        [name, [...new Set(asked.redirectUris)]]
      ),
    "That app could not be registered."
  );
  if (!row) throw new Error("insert into oauth_clients returned no row");
  return {
    clientId: row.id,
    name: row.name,
    redirectUris: row.redirectUris,
    issuedAt: row.createdAt,
  };
}

/**
 * The name an app goes by: what it said, on one line, trimmed and cut to fit — or
 * *An assistant* when it said nothing worth showing.
 */
function nameOf(said: string | null | undefined): string {
  // \p{Cc} is every control character: a name with a newline or a bell in it is drawn on one
  // line, as the words it has.
  const line = (said ?? "").replace(/[\p{Cc}\s]+/gu, " ").trim();
  if (line === "") return UNNAMED_CLIENT;
  return Array.from(line).slice(0, NAME_LENGTH).join("").trim();
}

/**
 * Issue a code: the owner said yes to this app, on the consent screen.
 *
 * The caller has already checked the request (`src/lib/oauth/authorize.ts`); this checks
 * again what the database can answer — that the app exists and the address is one of its own —
 * because a Server Function is a POST anyone can make, and the code is the owner's yes.
 *
 * Codes past their life are swept a day after they expired. A day, not at once, because a used
 * code is kept to recognise a second use of it, and a second use comes soon or never.
 */
export async function issueAuthorizationCode(asked: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const code = randomBytes(32).toString("base64url");

  await transaction(async (run) => {
    const [client] = await run<{ redirectUris: string[] }>(
      `select redirect_uris as "redirectUris" from oauth_clients where id = $1`,
      [asked.clientId]
    );
    if (!client) throw new Refusal("not-found", "No app registered with that id.");
    if (!client.redirectUris.includes(asked.redirectUri)) {
      throw new Refusal("invalid", "That app did not register that address to come back to.");
    }

    await run(`delete from oauth_codes where expires_at < now() - interval '1 day'`);
    await refusing(
      () =>
        run(
          `insert into oauth_codes (code_hash, client_id, redirect_uri, code_challenge, expires_at)
           values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
          [
            hashOf(code),
            asked.clientId,
            asked.redirectUri,
            asked.codeChallenge,
            CODE_LIFE_IN_SECONDS,
          ]
        ),
      (constraint) =>
        constraint === "oauth_codes_challenge_is_an_s256"
          ? "The app's PKCE challenge is not an S256 one."
          : "That code could not be issued."
    );
  });

  return code;
}

/**
 * Redeem a code for a grant: the app comes back with the code, the address it was sent to,
 * and the PKCE verifier only it knows.
 *
 * **A code is burnt the first time it is presented**, whether or not the rest holds: a wrong
 * verifier is then one guess, not the first of many. **Presented a second time, it revokes the
 * grant the first use produced** (OAuth 2.1 §4.1.3): either the app retried — harmless, it
 * signs in again — or somebody else holds the code, and then nobody should hold the grant.
 *
 * A refusal is a verdict, not a throw, so that the transaction commits what it learned — a
 * code burnt, a grant revoked — rather than rolling it back with the refusal.
 */
export async function redeemAuthorizationCode(asked: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GrantVerdict> {
  return transaction(async (run) => {
    const [code] = await run<{
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      expired: boolean;
      used: boolean;
      grantId: string | null;
    }>(
      `select client_id as "clientId", redirect_uri as "redirectUri",
              code_challenge as "codeChallenge", expires_at <= now() as expired,
              used_at is not null as used, grant_id as "grantId"
         from oauth_codes
        where code_hash = $1
          for update`,
      [hashOf(asked.code)]
    );
    if (!code) return refused("unknown-code");

    if (code.used) {
      if (code.grantId) await revokeGrantOn(run, code.grantId);
      return refused("code-reused");
    }
    await run("update oauth_codes set used_at = now() where code_hash = $1", [hashOf(asked.code)]);

    if (code.expired) return refused("code-expired");
    if (code.clientId !== asked.clientId) return refused("wrong-client");
    if (code.redirectUri !== asked.redirectUri) return refused("wrong-redirect");
    if (!pkceHolds(asked.codeVerifier, code.codeChallenge)) return refused("pkce-failed");

    const refreshToken = newSecret(REFRESH_PREFIX);
    const [grant] = await run<{ id: string; name: string }>(
      `insert into oauth_grants (client_id, name, refresh_hash)
       select id, name, $2 from oauth_clients where id = $1
       returning id, name`,
      [code.clientId, hashOf(refreshToken)]
    );
    if (!grant) throw new Error("insert into oauth_grants returned no row");
    await run("update oauth_codes set grant_id = $2 where code_hash = $1", [
      hashOf(asked.code),
      grant.id,
    ]);

    const accessToken = await issueUnder(run, grant);
    return {
      ok: true,
      granted: {
        grantId: grant.id,
        accessToken,
        refreshToken,
        expiresInSeconds: ACCESS_TOKEN_LIFE_IN_SECONDS,
      },
    };
  });
}

/**
 * Trade a refresh token for a new one and a new access token (OAuth 2.1 §4.3).
 *
 * **The refresh token rotates**: the one presented is refused from now on, so a copy of it
 * that leaked is good for at most one use, and the app that was robbed finds out by being
 * refused. The access tokens already issued stay good until their hour is up.
 *
 * And the grant's **expired access tokens are deleted** here. That is the one deletion in this
 * table, and it is fine for these rows where it is not for the owner's: an owner's token is a
 * record the owner named, and *what called last week* has to keep an answer — an OAuth access
 * token is one of twenty-four a day, refused already, and what it would answer is on the grant
 * (`last_used_at`). Kept, they would be the bulk of the table within a month and tell nobody
 * anything. The refresh is the moment because it is the moment a new one is added.
 */
export async function refreshGrant(asked: {
  refreshToken: string;
  clientId: string;
}): Promise<GrantVerdict> {
  return transaction(async (run) => {
    const [grant] = await run<{ id: string; name: string; clientId: string; revoked: boolean }>(
      `select id, name, client_id as "clientId", revoked_at is not null as revoked
         from oauth_grants
        where refresh_hash = $1
          for update`,
      [hashOf(asked.refreshToken)]
    );
    if (!grant) return refused("unknown-refresh");
    if (grant.revoked) return refused("grant-revoked");
    if (grant.clientId !== asked.clientId) return refused("wrong-client");

    const refreshToken = newSecret(REFRESH_PREFIX);
    await run("update oauth_grants set refresh_hash = $2 where id = $1", [
      grant.id,
      hashOf(refreshToken),
    ]);
    await run("delete from access_tokens where grant_id = $1 and expires_at <= now()", [grant.id]);

    const accessToken = await issueUnder(run, grant);
    return {
      ok: true,
      granted: {
        grantId: grant.id,
        accessToken,
        refreshToken,
        expiresInSeconds: ACCESS_TOKEN_LIFE_IN_SECONDS,
      },
    };
  });
}

/**
 * Disconnect an app, from `/settings`: the grant is revoked, and every access token issued
 * under it in the same transaction, so the door refuses the app from its next request on. The
 * row stays. Returns the app's name, for the sentence that says it is done.
 *
 * Revoking one already revoked is refused, so the owner learns they named the wrong one.
 */
export async function revokeGrant(grantId: string): Promise<{ name: string }> {
  return transaction(async (run) => {
    const [found] = await run<{ name: string; revoked: boolean }>(
      `select name, revoked_at is not null as revoked from oauth_grants where id = $1 for update`,
      [grantId]
    );
    if (!found) throw new Refusal("not-found", "No connected app has that id.");
    if (found.revoked) throw new Refusal("not-allowed", "That app is already disconnected.");

    await revokeGrantOn(run, grantId);
    return { name: found.name };
  });
}

/**
 * Revoke whatever grant a secret belongs to — its refresh token or one of its access tokens —
 * for the app that asks to be disconnected (RFC 7009).
 *
 * **Says nothing back**, as the RFC has it: an unknown secret, one already revoked and one
 * revoked now all look the same, so the endpoint is no oracle for which secrets exist. A token
 * the owner issued by name is not touched: those are revoked by the owner, from `/settings`.
 */
export async function revokeBySecret(secret: string): Promise<void> {
  const hash = hashOf(secret);
  await transaction(async (run) => {
    const [found] = await run<{ id: string }>(
      `select id from oauth_grants where refresh_hash = $1 and revoked_at is null
       union
       select g.id from access_tokens t join oauth_grants g on g.id = t.grant_id
        where t.secret_hash = $1 and g.revoked_at is null`,
      [hash]
    );
    if (found) await revokeGrantOn(run, found.id);
  });
}

/** Revoke a grant and its live access tokens, inside the caller's transaction. */
async function revokeGrantOn(run: Executor, grantId: string): Promise<void> {
  await run("update oauth_grants set revoked_at = now() where id = $1 and revoked_at is null", [
    grantId,
  ]);
  await run(
    "update access_tokens set revoked_at = now() where grant_id = $1 and revoked_at is null",
    [grantId]
  );
}

/** A new access token under a grant, an hour long, named after the app. Returns its secret. */
async function issueUnder(run: Executor, grant: { id: string; name: string }): Promise<string> {
  const secret = newSecret(ACCESS_PREFIX);
  await run(
    `insert into access_tokens (name, secret_hash, grant_id, expires_at)
     values ($1, $2, $3, now() + make_interval(secs => $4))`,
    [grant.name, hashOf(secret), grant.id, ACCESS_TOKEN_LIFE_IN_SECONDS]
  );
  return secret;
}

/**
 * Whether a PKCE verifier produces the challenge sent with the authorization request — S256,
 * the only method taken: `base64url(SHA-256(verifier))` (RFC 7636 §4.6).
 *
 * The verifier is checked for its shape first — 43 to 128 unreserved characters — because one
 * that is not a verifier at all is not something to hash and compare. The comparison itself is
 * `timingSafeEqual`, the one secret comparison in this module that is not a lookup by hash.
 */
export function pkceHolds(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(
    createHash("sha256").update(verifier, "ascii").digest("base64url"),
    "utf8"
  );
  const expected = Buffer.from(challenge, "utf8");
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

function refused(refusal: GrantRefusal): GrantVerdict {
  return { ok: false, refusal };
}
