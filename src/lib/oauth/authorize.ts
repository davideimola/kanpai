import "server-only";

import { findOAuthClient } from "@/core/queries/oauth";
import { issuerOf, resourceMatches } from "./origin";

// The authorization request, read and judged (RFC 6749 §4.1.1, OAuth 2.1 §4.1.1, ADR-0013).
//
// The consent page asks this before it shows anything, and its Server Function asks it again
// before it issues a code — the form's hidden fields are a POST anyone can make, so they are a
// request to judge, not a request already judged.
//
// The verdict comes in three, and the split between the first two is the one rule that matters
// here (RFC 6749 §4.1.2.1): **until the app and its redirect address are known to belong
// together, nothing is sent anywhere.** An unknown `client_id`, or an address the app did not
// register, gets a page saying so — a redirect then would make this server an open redirector
// for whoever wrote the link. Once both hold, every other mistake goes back to the app, at that
// address, as an `error` it can act on.

/** What an app asked for, once it is known to be a fair request. */
export type AuthorizationRequest = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
};

export type AuthorizationVerdict =
  /** Show the consent screen for this request. */
  | { kind: "ask"; request: AuthorizationRequest }
  /** Send the owner back to the app with an error. The address is the app's own, and checked. */
  | { kind: "send-back"; to: string }
  /** Say so on a page and send nobody anywhere: the address cannot be trusted. */
  | { kind: "stop"; message: string };

/** Something that hands out a parameter by name: a page's search params, or a posted form. */
type Asked = { get(name: string): string | null };

/**
 * Judge an authorization request. `origin` is this copy's (`./origin.ts`), for the `resource`
 * and the `iss` on the way back.
 */
export async function judgeAuthorizationRequest(
  asked: Asked,
  origin: string
): Promise<AuthorizationVerdict> {
  const clientId = asked.get("client_id");
  const client = clientId ? await findOAuthClient(clientId) : null;
  if (!client) {
    return {
      kind: "stop",
      message:
        "The app that sent you here is not one kanpai knows. Go back to it and connect again from the start.",
    };
  }

  // An app with exactly one address may leave it out (RFC 6749 §3.1.2.3); otherwise it names
  // one of its own, exactly — not a prefix, not one with another query.
  const named = asked.get("redirect_uri");
  const redirectUri = named ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return {
      kind: "stop",
      message: `${client.name} asked to send you back to an address it did not register. Nothing was sent; connect again from the app.`,
    };
  }

  const state = asked.get("state");
  const back = (error: string, description: string): AuthorizationVerdict => ({
    kind: "send-back",
    to: sendBack(redirectUri, origin, state, { error, error_description: description }),
  });

  if (asked.get("response_type") !== "code") {
    return back("unsupported_response_type", "Only response_type=code is supported.");
  }
  const codeChallenge = asked.get("code_challenge");
  if (!codeChallenge) return back("invalid_request", "PKCE is required: send a code_challenge.");
  if ((asked.get("code_challenge_method") ?? "plain") !== "S256") {
    return back("invalid_request", "Only the S256 code_challenge_method is supported.");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    return back("invalid_request", "The code_challenge is not an S256 challenge.");
  }
  if (!resourceMatches(asked.get("resource"), origin)) {
    return back("invalid_target", "This server issues tokens for its own /mcp only.");
  }

  return {
    kind: "ask",
    request: { clientId: client.id, clientName: client.name, redirectUri, codeChallenge, state },
  };
}

/**
 * The app's redirect address with the answer appended — a code or an error — and the `state`
 * it sent, and `iss` (RFC 9207), so that a client talking to several servers knows which one
 * answered. Appended to whatever query the address already has, which RFC 6749 §3.1.2 says must
 * be kept.
 */
export function sendBack(
  redirectUri: string,
  origin: string,
  state: string | null,
  answer: Record<string, string>
): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(answer)) url.searchParams.set(name, value);
  if (state !== null) url.searchParams.set("state", state);
  url.searchParams.set("iss", issuerOf(origin));
  return url.toString();
}
