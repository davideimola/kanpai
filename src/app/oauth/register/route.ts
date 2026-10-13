import { isRefusal } from "@/core/refusal";
import { registerOAuthClient } from "@/core/verbs/oauth";
import { noStore, oauthError, preflight, refuseAFlood } from "@/lib/oauth/http";

// Dynamic Client Registration (RFC 7591), the way an app nobody configured gets a `client_id`
// (ADR-0013). ChatGPT calls it once per connection and keeps what it is given; Claude does the
// same.
//
// **Anyone may call it, and that is the design, not a hole.** What it writes is a name and the
// addresses a code may be sent back to; nothing it returns opens the door. The owner's yes on
// the consent screen does, and that screen shows the name as the app's own claim, beside where
// it will send them. It is limited (`refuseAFlood`) because it writes a row for anyone who asks.
//
// Public clients only. An app asking for `client_secret_basic` or `client_secret_post` is
// registered as `none` anyway, and the answer says so — RFC 7591 §3.2.1 has the server return
// the metadata it actually registered, and every MCP client takes `none` with PKCE.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const flooded = refuseAFlood(request);
  if (flooded) return flooded;

  let asked: unknown;
  try {
    asked = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "The body is not a JSON object.");
  }
  if (!asked || typeof asked !== "object" || Array.isArray(asked)) {
    return oauthError("invalid_client_metadata", "The body is not a JSON object.");
  }
  const metadata = asked as Record<string, unknown>;

  const redirectUris = metadata.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((uri) => typeof uri === "string")
  ) {
    return oauthError("invalid_redirect_uri", "redirect_uris is a list of at least one address.");
  }

  const grantTypes = metadata.grant_types;
  if (
    grantTypes !== undefined &&
    (!Array.isArray(grantTypes) ||
      !grantTypes.every((type) => type === "authorization_code" || type === "refresh_token"))
  ) {
    return oauthError(
      "invalid_client_metadata",
      "Only the authorization_code and refresh_token grant types are supported."
    );
  }
  const responseTypes = metadata.response_types;
  if (
    responseTypes !== undefined &&
    (!Array.isArray(responseTypes) || !responseTypes.every((type) => type === "code"))
  ) {
    return oauthError("invalid_client_metadata", "Only the code response type is supported.");
  }
  const name = typeof metadata.client_name === "string" ? metadata.client_name : null;

  try {
    const client = await registerOAuthClient({ name, redirectUris: redirectUris as string[] });
    return noStore(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.issuedAt.getTime() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "kanpai",
      },
      201
    );
  } catch (error) {
    if (!isRefusal(error)) throw error;
    // The verb refuses only the addresses; the name it fixes rather than refuses.
    return oauthError("invalid_redirect_uri", error.message);
  }
}

export function OPTIONS(): Response {
  return preflight();
}
