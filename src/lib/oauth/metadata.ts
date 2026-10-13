import { issuerOf, resourceOf } from "./origin";

// The two documents a client reads before it has anything to authenticate with (ADR-0013).
//
// A client is pointed at `/mcp` and nothing else. It is refused there with a 401 naming the
// **protected resource metadata** (RFC 9728), which names the **authorization server**; that
// server's metadata (RFC 8414) names every endpoint the flow needs. Two hops, both served by
// kanpai, because kanpai is both.
//
// Both are built here, as plain values from one origin, so that the routes serving them under
// `.well-known` are a line each and a test can hold the shape without a server.

/** The one scope. kanpai has one owner and one record; there is nothing narrower to grant. */
export const SCOPE = "kanpai";

/** RFC 9728: what `/mcp` is and who issues tokens for it. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceOf(origin),
    authorization_servers: [issuerOf(origin)],
    bearer_methods_supported: ["header"],
    scopes_supported: [SCOPE],
    resource_name: "kanpai",
  };
}

/**
 * RFC 8414: where to register, where to send the owner, where to redeem a code.
 *
 * What is advertised is what is built, and nothing more: the authorization code with S256 PKCE
 * and the refresh token, for public clients only (`none`), and the `iss` parameter on the
 * redirect (RFC 9207). No `client_id_metadata_document_supported` — Client ID Metadata
 * Documents are not built, and ADR-0013 says why — so a client falls back to the
 * `registration_endpoint`, which every MCP client this is for does.
 */
export function authorizationServerMetadata(origin: string) {
  const issuer = issuerOf(origin);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  };
}
