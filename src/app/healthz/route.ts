import { databaseAnswers } from "@/core/health";

// Whether this copy can serve, asked by whatever runs it — a Kubernetes readiness probe, a
// `docker compose` healthcheck — and by nobody else in particular.
//
// "Can serve" is "the database answers": every page and every tool reads Postgres, so a
// process that is up over a database that is not would answer the sign-in screen and fail
// everything behind it. `@/core/health` asks; this turns the answer into a status a probe
// reads without parsing anything.
//
// It is not a page and it is not in a route group. `src/proxy.ts` excludes `/healthz` from
// the Google matcher by name, because a probe has no session and a `307 /signin` is an answer
// it counts as healthy. Nothing here is the owner's: it reads no row, writes nothing, and
// says `ok` or `unavailable` — never why, which is in the log.

/** The pool is node's, and every request asks the database. Nothing here is static. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** An answer about this moment, so nothing between the probe and the app may keep one. */
const HEADERS = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" };

export async function GET(): Promise<Response> {
  if (await databaseAnswers()) return new Response("ok", { status: 200, headers: HEADERS });
  return new Response("unavailable", { status: 503, headers: HEADERS });
}
