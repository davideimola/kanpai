import { findOAuthClient } from "@/core/queries/oauth";
import { type GrantVerdict, redeemAuthorizationCode, refreshGrant } from "@/core/verbs/oauth";
import {
  basicClientId,
  noStore,
  oauthError,
  paramsOf,
  preflight,
  refuseAFlood,
} from "@/lib/oauth/http";
import { SCOPE } from "@/lib/oauth/metadata";
import { originOf, resourceMatches } from "@/lib/oauth/origin";

// The token endpoint (OAuth 2.1 §3.2, ADR-0013): a code becomes a grant, and a refresh token
// becomes the next one. Thin like every door here — read the parameters, ask the core, say
// what it said in RFC 6749's words.
//
// Outside the Google gate (`src/proxy.ts`): the app calls it from its own server, with no
// cookie, and what stands in for the owner here is the code the owner's yes produced and the
// PKCE verifier only the app that asked for it holds.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const flooded = refuseAFlood(request);
  if (flooded) return flooded;

  const params = await paramsOf(request);
  const clientId = params.get("client_id") ?? basicClientId(request.headers.get("authorization"));
  const grantType = params.get("grant_type");

  if (!grantType) return oauthError("invalid_request", "grant_type is missing.");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return oauthError(
      "unsupported_grant_type",
      "Only authorization_code and refresh_token are supported."
    );
  }

  // A public client has nothing to authenticate with but its id, so this is the whole of
  // client authentication: an id that registered.
  if (!clientId) return oauthError("invalid_request", "client_id is missing.");
  if (!(await findOAuthClient(clientId))) {
    return oauthError("invalid_client", "No app registered with that client_id.", 401);
  }

  if (!resourceMatches(params.get("resource"), originOf(request))) {
    return oauthError("invalid_target", "This server issues tokens for its own /mcp only.");
  }

  let verdict: GrantVerdict;
  if (grantType === "authorization_code") {
    const code = params.get("code");
    const redirectUri = params.get("redirect_uri");
    const codeVerifier = params.get("code_verifier");
    if (!code) return oauthError("invalid_request", "code is missing.");
    if (!redirectUri) return oauthError("invalid_request", "redirect_uri is missing.");
    if (!codeVerifier)
      return oauthError("invalid_request", "code_verifier is missing: PKCE is required.");
    verdict = await redeemAuthorizationCode({ code, clientId, redirectUri, codeVerifier });
  } else {
    const refreshToken = params.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request", "refresh_token is missing.");
    verdict = await refreshGrant({ refreshToken, clientId });
  }

  if (!verdict.ok) {
    // Which of them it was is the log's: the app is told the grant is no good, which is all it
    // can act on — start again from the authorization.
    console.warn("OAuth token request refused", { grantType, refusal: verdict.refusal });
    return oauthError("invalid_grant", "That code or refresh token is not valid.");
  }

  return noStore({
    access_token: verdict.granted.accessToken,
    token_type: "Bearer",
    expires_in: verdict.granted.expiresInSeconds,
    refresh_token: verdict.granted.refreshToken,
    scope: SCOPE,
  });
}

export function OPTIONS(): Response {
  return preflight();
}
