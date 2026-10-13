import { preflight, withCors } from "@/lib/oauth/http";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { originOf } from "@/lib/oauth/origin";

// RFC 8414's authorization server metadata: where an app registers, where the owner is sent to
// say yes, where a code is redeemed (ADR-0013). The second document a client reads, after the
// protected resource metadata names this server.
//
// Also at `./mcp/`, the path-suffixed form a client builds when it takes the resource's address
// for the issuer's. Not at `/.well-known/openid-configuration`: kanpai is not an OpenID
// provider — it issues no ID token and has no userinfo — and a discovery document claiming it
// was would be read as a promise. The MCP clients this is for read RFC 8414 first.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return withCors(Response.json(authorizationServerMetadata(originOf(request))));
}

export function OPTIONS(): Response {
  return preflight();
}
