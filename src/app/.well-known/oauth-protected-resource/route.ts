import { preflight, withCors } from "@/lib/oauth/http";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";
import { originOf } from "@/lib/oauth/origin";

// RFC 9728's protected resource metadata: what `/mcp` is, and that kanpai itself issues the
// tokens for it (ADR-0013). The first document a client reads, named in the 401 `/mcp` answers
// with no token.
//
// Served at the root and at `./mcp/` — the path-suffixed form RFC 9728 §3.1 derives from a
// resource at `/mcp`, which is the one `WWW-Authenticate` names — because clients try both.
// Outside the Google gate under `.well-known` (`src/proxy.ts`): a client reads it before it has
// anything to authenticate with.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return withCors(Response.json(protectedResourceMetadata(originOf(request))));
}

export function OPTIONS(): Response {
  return preflight();
}
