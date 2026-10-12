import { authenticateAccessToken, type Caller, type TokenRefusal } from "@/core/verbs/access-token";

// The MCP door's gate, and the whole of it.
//
// The web view is gated by Google restricted to one address; `/mcp` is not, because a
// redirect to a consent screen is not an answer an assistant can read. It takes **bearer
// tokens the owner issues** instead (ADR-0009) — named, shown once, stored as a hash,
// revoked one by one. That is where it parts from tsundoku, whose door compares one static
// token from the environment: rotating that one breaks every client at once, and nothing
// says which of them called.
//
// So the verdict is the core's: the tokens are records (`@/core/verbs/access-token`), and the
// one thing left to this file is reading one out of the `Authorization` header — which is
// HTTP, and therefore the door's and not the core's.
//
// **ChatGPT comes through the same check.** OpenAI's Secure MCP Tunnel is transport only: it
// presents a token issued for it, like any other client (ADR-0009). There is no tunnel path
// here and there must not be one — a header or an address that let traffic past this gate
// because it *looked* like the tunnel would be a door anyone could walk through by looking
// like it.

/**
 * Why a request was refused. For the server's own diagnosis only — every one of them comes
 * back to the client as the same 401, because *which* mistake it was is information the
 * client has not earned.
 */
type BearerRefusal =
  /** No `Authorization: Bearer …` on the request. Ordinarily a client's first probe. */
  "absent" | TokenRefusal;

type BearerVerdict = { ok: true; caller: Caller } | { ok: false; refusal: BearerRefusal };

/**
 * The token out of an `Authorization` header, or `null` if there is not one in it.
 *
 * The scheme is matched case-insensitively because RFC 7235 says it is case-insensitive
 * and a client sending `bearer` is right. Nothing about the token itself is forgiven: a
 * different scheme carrying the same secret is not a bearer token, and an empty one is
 * not a token.
 */
function bearerFrom(authorization: string | null | undefined): string | null {
  const match = /^Bearer +(\S.*)$/i.exec((authorization ?? "").trim());
  return match?.[1] ? match[1].trim() || null : null;
}

/**
 * Whether this request may reach the owner's record, and with which token.
 *
 * **Fails closed**: with no token issued, nothing matches and every request is refused —
 * a fresh copy answers nobody until its owner has issued one. There is deliberately no
 * development opt-in beside it, unlike the owner gate: issuing a token locally is one
 * command (`pnpm token:issue`), so there is nothing for an opt-in to stand in for.
 */
export async function bearerGate(authorization: string | null | undefined): Promise<BearerVerdict> {
  const presented = bearerFrom(authorization);
  if (presented === null) return { ok: false, refusal: "absent" };
  return authenticateAccessToken(presented);
}
