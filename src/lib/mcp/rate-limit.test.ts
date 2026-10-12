import { describe, expect, it } from "vitest";
import type { RateLimiter } from "./rate-limit";
import {
  clientOf,
  createRateLimiter,
  PER_CLIENT,
  WHOLE_DOOR,
  WINDOW_IN_MILLISECONDS,
  WINDOW_IN_SECONDS,
} from "./rate-limit";

// Seam 2, the arithmetic half. `src/app/mcp/route.test.ts` proves the limiter stands in
// front of the bearer gate at the HTTP edge; this proves what it counts.
//
// Shaped like `src/lib/auth/gate.test.ts`: the thing under test is a **predicate**, so
// the test is a table of cases rather than an argument. `now` is a parameter and not a
// clock, which is what lets a window roll over without a timer and without a fake one.

/** A limiter of its own, so no two cases here share a counter. */
function limiter() {
  return createRateLimiter();
}

/** Spend a client's whole allowance, which is the arrangement half of nearly every case. */
function exhaust(allow: RateLimiter, client: string, now = 0): void {
  for (let n = 0; n < PER_CLIENT; n += 1) allow(client, now);
}

describe("what the limiter counts", () => {
  it("lets a client through up to its allowance", () => {
    const allow = limiter();

    for (let n = 0; n < PER_CLIENT; n += 1) {
      expect(allow("1.2.3.4", 0)).toEqual({ ok: true });
    }
  });

  it("refuses the request after the allowance, and says when to come back", () => {
    const allow = limiter();
    exhaust(allow, "1.2.3.4");

    expect(allow("1.2.3.4", 0)).toEqual({ ok: false, retryAfterInSeconds: WINDOW_IN_SECONDS });
  });

  // The window is fixed rather than sliding: simpler, and the difference only matters to
  // somebody trying to sit exactly on the boundary, which costs them the next window.
  it("forgives the client when the window has passed", () => {
    const allow = limiter();
    exhaust(allow, "1.2.3.4");

    expect(allow("1.2.3.4", WINDOW_IN_MILLISECONDS - 1).ok).toBe(false);
    expect(allow("1.2.3.4", WINDOW_IN_MILLISECONDS)).toEqual({ ok: true });
  });

  it("counts down the wait as the window drains", () => {
    const allow = limiter();
    exhaust(allow, "1.2.3.4");

    expect(allow("1.2.3.4", 30_000)).toEqual({ ok: false, retryAfterInSeconds: 30 });
    // Never zero: a client told to retry in no time at all retries immediately and is
    // refused again, which is a busy loop rather than a wait.
    expect(allow("1.2.3.4", WINDOW_IN_MILLISECONDS - 1)).toEqual({
      ok: false,
      retryAfterInSeconds: 1,
    });
  });

  it("counts each client separately", () => {
    const allow = limiter();
    exhaust(allow, "1.2.3.4");

    expect(allow("1.2.3.4", 0).ok).toBe(false);
    expect(allow("5.6.7.8", 0)).toEqual({ ok: true });
  });
});

// The per-client window alone is not a limit on a brute force: whoever wants the bearer
// token rotates addresses, and thirty guesses each from a thousand addresses is thirty
// thousand guesses. The ceiling over the whole door is what actually bounds that, and it
// is affordable here because the legitimate traffic on this endpoint is one assistant
// answering one person's questions.
describe("the ceiling over the whole door", () => {
  /** Enough distinct clients, each staying under its own allowance, to reach the ceiling. */
  function flood(allow: RateLimiter, requests: number, now: number) {
    for (let n = 0; n < requests; n += 1) allow(`10.0.${Math.floor(n / 10)}.${n % 10}`, now);
  }

  it("refuses a distributed flood that no single client would trip", () => {
    const allow = limiter();
    flood(allow, WHOLE_DOOR, 0);

    expect(allow("172.16.0.1", 0)).toEqual({ ok: false, retryAfterInSeconds: WINDOW_IN_SECONDS });
  });

  it("is not spent by a client that was already refused", () => {
    const allow = limiter();
    // One client, far past its own allowance. If its refusals counted against the door,
    // one address could lock the owner's own assistant out.
    for (let n = 0; n < WHOLE_DOOR * 2; n += 1) allow("1.2.3.4", 0);

    expect(allow("5.6.7.8", 0)).toEqual({ ok: true });
  });

  it("forgives the door when the window has passed", () => {
    const allow = limiter();
    flood(allow, WHOLE_DOOR, 0);

    expect(allow("172.16.0.1", 0).ok).toBe(false);
    expect(allow("172.16.0.1", WINDOW_IN_MILLISECONDS)).toEqual({ ok: true });
  });
});

// A key is memory, and the header it comes from is written by whoever is calling. Nothing
// stops an attacker sending a different address on every request, so the table has to be
// bounded by something other than good manners.
describe("the table of clients", () => {
  it("survives a flood of invented addresses", () => {
    const allow = limiter();
    for (let n = 0; n < 50_000; n += 1) allow(`10.${n % 250}.${((n / 250) % 250) | 0}.${n % 7}`, n);

    // The owner's own assistant still gets an answer at the end of it, which is the only
    // thing that matters — and the process is still alive to give it.
    expect(allow("1.2.3.4", 60_000_000).ok).toBe(true);
  });
});

// A proxy in front of this endpoint overwrites the header, so the leftmost hop it appends is
// the client. Reading it is a decision and not an obvious one — see the module.
describe("who the client is", () => {
  // The one the proxy writes rather than forwards: no list, and nothing to prepend to.
  it("is x-real-ip when the proxy set one", () => {
    expect(clientOf(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("prefers x-real-ip over anything the caller may have put in x-forwarded-for", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "1.1.1.1, 203.0.113.7",
    });

    expect(clientOf(headers)).toBe("203.0.113.7");
  });

  it("is the leftmost address in x-forwarded-for", () => {
    expect(clientOf(new Headers({ "x-forwarded-for": "203.0.113.7, 10.42.0.1" }))).toBe(
      "203.0.113.7"
    );
  });

  it("tolerates the whitespace a proxy leaves behind", () => {
    expect(clientOf(new Headers({ "x-forwarded-for": "  203.0.113.7 ,10.42.0.1" }))).toBe(
      "203.0.113.7"
    );
  });

  it("falls back to one shared key when there is no proxy header", () => {
    expect(clientOf(new Headers())).toBe("direct");
    expect(clientOf(new Headers({ "x-forwarded-for": "   " }))).toBe("direct");
    expect(clientOf(new Headers({ "x-real-ip": "  " }))).toBe("direct");
  });
});
