// What stands in front of the bearer gate — tsundoku's, taken over with its stack
// (ADR-0001).
//
// `/mcp` is reachable from the internet wherever a copy is deployed (ADR-0008), and an
// endpoint that answers a token check to anyone who asks is an endpoint that can be asked
// forever. So the limiter runs **before** `bearerGate`, not after: a refusal that costs a
// database query — which every token check here is (ADR-0009) — a SHA-256 or even a log line
// is still a refusal somebody can buy millions of.
//
// Shaped like `./bearer.ts` and `@/lib/auth/gate.ts`: a **predicate** the route handler
// asks for a verdict, which knows nothing about status codes or headers. It differs from
// both in the one way it has to — it remembers — and `now` is therefore a parameter rather
// than a clock, which is what keeps the arithmetic a table of cases in
// `rate-limit.test.ts`.
//
// ## Two windows, and why the second one exists
//
// **Per client**, so one caller cannot occupy the door; and **over the whole door**, so a
// caller who rotates addresses cannot either.
//
// The second one is there because **the first one's key is only as honest as the proxy in
// front of it**. `clientOf` below reads a header, and a header is written by whoever is
// calling; if the proxy ever stopped overwriting it, every request could arrive with a fresh
// address and its own fresh allowance. The ceiling over the whole door is what is left when
// that happens, so it is deliberately not a large number: the legitimate traffic here is one
// assistant answering one person's questions, closer to thirty a day than three hundred a
// minute.
//
// A request already refused by its own allowance is **not** charged to the door, so an
// address hammering the endpoint spends thirty of the ceiling and not three hundred.
// **The remaining trade is real and worth naming**: a flood spread across enough addresses
// can still fill the ceiling, and while it does, the owner's own assistant is refused too.
// That is accepted. It clears in a minute, and the alternative to refusing the owner for a
// minute is not refusing the flood.
//
// What none of this is, is a defence of the token. A 256-bit bearer is not brute-forced at
// three hundred guesses a minute or at three hundred million; the limit is here so that
// trying costs this endpoint nothing, not so that trying fails.
//
// ## The state is in this process, and that is an assumption
//
// One `Map`, in memory, for the life of the container. **It assumes one replica**, which
// is what `compose.yaml` runs and what a single-owner copy needs anyway. Two replicas would each hold their own counters and the
// effective limits would double — wrong, but wrong in the safe direction, and loudly so.
// Anything sharing this across replicas means a Redis this app does not have and does not
// want; the honest fix if a second replica is ever wanted is to say so here first.
//
// A restart forgets the counters. That is a real hole and a small one: a deploy is a
// deliberate act by the owner, and the door reopens with a fresh window rather than
// forgiving anything already refused.

/** How long a window lasts. Fixed rather than sliding — see the tests. */
export const WINDOW_IN_SECONDS = 60;

/** The same length in the unit `now` is in. Named because it was open-coded three times. */
export const WINDOW_IN_MILLISECONDS = WINDOW_IN_SECONDS * 1000;

/** What one caller may ask for in a window. Generous for an assistant, useless for a search. */
export const PER_CLIENT = 30;

/** What everybody together may ask for in a window. What is left if the client key is not honest. */
export const WHOLE_DOOR = 300;

/** The key a request with no proxy in front of it counts against. */
const DIRECT = "direct";

/**
 * How many clients are remembered before the table is swept. Reached only under a flood
 * of invented addresses, which is exactly when it must not be memory the attacker
 * chooses the size of.
 */
const CLIENTS_REMEMBERED = 4096;

/** Whether this request may reach the gate, and how long to wait if not. */
export type RateVerdict = { ok: true } | { ok: false; retryAfterInSeconds: number };

/** A limiter: a client and a moment in, a verdict out. Remembers between calls. */
export type RateLimiter = (client: string, now: number) => RateVerdict;

type Window = { startedAt: number; count: number };

/**
 * Who is calling, as far as this door can tell.
 *
 * **`X-Real-Ip` first**, because it is the one the proxy writes rather than forwards: a
 * single address, replaced on every request, with no list for a caller to prepend to.
 * `X-Forwarded-For` is the fallback and its leftmost entry is the client — but only if
 * whatever set it overwrote what the caller sent, and a caller is free to send one.
 *
 * A proxy that overwrites both — Traefik with no trusted IPs does, and so should whatever
 * TLS terminator a copy sits behind — drops an untrusted peer's `X-Forwarded-*` before
 * writing its own. **The limiter does not rely on that being true**, which is
 * the whole point of the ceiling over the whole door: if this key is ever forgeable, the
 * ceiling is what still refuses the flood.
 *
 * With neither header every caller shares one key. That is deliberately strict rather than
 * deliberately lax: unproxied traffic here is the local loop or something unaccounted for,
 * and neither deserves its own allowance.
 */
export function clientOf(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  const leftmost = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return leftmost || DIRECT;
}

/**
 * A limiter with its own counters.
 *
 * Exported so a test can have one nobody else has touched, and so a second door can take
 * counters of its own: the OAuth endpoints do (`@/lib/oauth/http`, ADR-0013), so an app
 * registering never spends the allowance an assistant needs here. `rateLimit` below is the
 * door's.
 */
export function createRateLimiter(): RateLimiter {
  const clients = new Map<string, Window>();
  const door: Window = { startedAt: Number.NEGATIVE_INFINITY, count: 0 };

  return (client, now) => {
    sweep(clients, now);

    const mine = charge(windowFor(clients, client), PER_CLIENT, now);
    if (!mine.ok) return mine;

    return charge(door, WHOLE_DOOR, now);
  };
}

function windowFor(clients: Map<string, Window>, client: string): Window {
  const existing = clients.get(client);
  if (existing) return existing;

  const fresh: Window = { startedAt: Number.NEGATIVE_INFINITY, count: 0 };
  clients.set(client, fresh);
  return fresh;
}

/**
 * Count one request against a window and say whether it fits, rolling the window over
 * first if the old one has expired.
 */
function charge(window: Window, allowance: number, now: number): RateVerdict {
  if (now - window.startedAt >= WINDOW_IN_MILLISECONDS) {
    window.startedAt = now;
    window.count = 0;
  }

  if (window.count >= allowance) {
    const remaining = window.startedAt + WINDOW_IN_MILLISECONDS - now;
    // Never zero. A client told to retry in no time at all retries immediately, is
    // refused again, and the wait it was given became a busy loop.
    return { ok: false, retryAfterInSeconds: Math.max(1, Math.ceil(remaining / 1000)) };
  }

  window.count += 1;
  return { ok: true };
}

/**
 * Drop the clients whose window has expired, once the table has grown past what a real
 * caller could explain.
 *
 * The keys come from a header, so their number is the attacker's choice and not the
 * owner's — an unbounded map here would be the flood's actual payload. Sweeping only when
 * the table is already large keeps the ordinary path free of it, and clearing outright if
 * every window is still live is the right answer to the only case that reaches it: a flood
 * of addresses nobody will see again.
 */
function sweep(clients: Map<string, Window>, now: number): void {
  if (clients.size <= CLIENTS_REMEMBERED) return;

  for (const [client, window] of clients) {
    if (now - window.startedAt >= WINDOW_IN_MILLISECONDS) clients.delete(client);
  }

  if (clients.size > CLIENTS_REMEMBERED) clients.clear();
}

/**
 * The limiter the door uses, and the reason there is exactly one of it.
 *
 * A module-level value, so it lives as long as the process and is shared by every request
 * the container serves. See the note at the top about the single replica this assumes.
 */
export const rateLimit: RateLimiter = createRateLimiter();
