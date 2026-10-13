// Where a sign-in lands, and the one exception to *always home* (ADR-0013).
//
// The gate sends a refused request to `/signin` with no `callbackUrl`, on purpose: the app has
// one home, a sign-in happens about once a quarter, and a destination read out of a query
// parameter is an open-redirect surface for the price of a convenience (`src/proxy.ts`).
//
// **OAuth's consent screen is the exception, because there the round trip *is* the feature.**
// ChatGPT opens `/oauth/authorize?…` in the owner's browser; with no session the proxy sends them
// to sign in; and if the sign-in then landed on the home page, the app would wait for an answer
// that never comes, and the owner would have to start the connection again — every time, on a
// phone with no session yet. So the proxy carries the request through as `next`, and this says
// whether a `next` may be honoured.
//
// The rule is a **prefix, and nothing cleverer**: `/oauth/authorize?` and the query after it.
// Anything starting with exactly that is a path on this host — not `//elsewhere` (a
// protocol-relative address), not `https:`, not `/\elsewhere` (which some browsers read as
// `//`) — because its first two characters are `/o`. What follows the `?` is a query, and a
// query cannot change which host or which page a browser goes to; the consent page judges it
// again before it shows anything (`@/lib/oauth/authorize`). Any other `next` is home.
//
// Pure, like `./gate.ts`, so the rule is a table of cases in `return-to.test.ts`.

/** The only place a sign-in may return to other than home. */
export const CONSENT_PATH = "/oauth/authorize";

/** Long enough for any authorization request; a longer one is not one. */
const LONGEST = 4096;

/**
 * Where to land after signing in: `next` if it is an authorization request on this host, and
 * `/` for anything else — absent, another page, another host, or not a string at all.
 */
export function returnTo(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (next.length > LONGEST) return "/";
  if (!next.startsWith(`${CONSENT_PATH}?`)) return "/";
  // Whitespace and control characters have no business in an address that came from the
  // proxy, which writes it encoded; one that has them was written by someone else.
  if (/[\s\p{Cc}\\]/u.test(next)) return "/";
  return next;
}
