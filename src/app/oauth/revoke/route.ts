import { revokeBySecret } from "@/core/verbs/oauth";
import { paramsOf, preflight, refuseAFlood, withCors } from "@/lib/oauth/http";

// Token revocation (RFC 7009, ADR-0013): an app disconnecting itself. Given its refresh token or
// one of its access tokens, the grant behind it is revoked, and every access token under it.
//
// **Always 200**, as the RFC has it — a token unknown, already revoked or revoked now all get
// the same answer, so this is no way to learn which secrets exist. A token the owner issued by
// name is not revoked here; the owner does that from `/settings`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const flooded = refuseAFlood(request);
  if (flooded) return flooded;

  const token = (await paramsOf(request)).get("token");
  if (token) await revokeBySecret(token);
  return withCors(new Response(null, { status: 200, headers: { "cache-control": "no-store" } }));
}

export function OPTIONS(): Response {
  return preflight();
}
