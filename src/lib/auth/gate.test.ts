import { describe, expect, it } from "vitest";

import {
  devGateIsOpen,
  type GateEnv,
  ownerEmailMatches,
  ownerGate,
  SESSION_LIFE_IN_SECONDS,
  sessionLifeRemains,
} from "./gate";

// Seam 2, the first of its two halves: the gate's verdict, in both directions.
//
// The predicate is pure — the environment and one session go in, a verdict comes
// out — so both directions of the gate are a table rather than a browser. That is
// the whole reason it is written this way: what the gate has to be sure of is that
// the owner's address gets in and every other address does not, and a function is the
// cheapest place in the world to be sure of that.

const OWNER = "owner@example.com";
const CONFIGURED: GateEnv = { AUTH_OWNER_EMAIL: OWNER };

// A fixed clock, so "too old" is a number rather than a race. `NOW` is milliseconds
// because that is what the gate takes; `openedAt` is seconds because that is the unit
// of the JWT claims it sits beside.
const NOW = Date.UTC(2026, 7, 28, 12, 0, 0);
const NOW_IN_SECONDS = Math.floor(NOW / 1000);

/** A session opened `secondsAgo` before `NOW`, by default a moment ago. */
function session(email: string | null, secondsAgo = 0) {
  return { email, openedAt: NOW_IN_SECONDS - secondsAgo };
}

describe("ownerEmailMatches", () => {
  it("matches the one configured address, folding case and whitespace", () => {
    expect(ownerEmailMatches(CONFIGURED, OWNER)).toBe(true);
    expect(ownerEmailMatches(CONFIGURED, " Owner@Example.COM ")).toBe(true);
    expect(ownerEmailMatches({ AUTH_OWNER_EMAIL: " Owner@Example.com " }, OWNER)).toBe(true);
  });

  it("refuses anyone else", () => {
    expect(ownerEmailMatches(CONFIGURED, "someone@example.com")).toBe(false);
  });

  it.each([undefined, null, "", "   "])("refuses the address %o", (email) => {
    expect(ownerEmailMatches(CONFIGURED, email)).toBe(false);
  });

  it("refuses when no owner is configured", () => {
    expect(ownerEmailMatches({}, OWNER)).toBe(false);
  });

  // The variable is singular, and this is where that stays true: a comma-separated
  // allowlist is a second account in a new hat, which the whole app is single-owner
  // in order not to have. It is a misconfiguration, not a list.
  it("refuses a comma-separated list, including its first name", () => {
    const list = { AUTH_OWNER_EMAIL: `${OWNER},someone@example.com` };
    expect(ownerEmailMatches(list, OWNER)).toBe(false);
    expect(ownerEmailMatches(list, "someone@example.com")).toBe(false);
  });

  // Unlike the gate, this predicate knows nothing about the development gate: a
  // sign-in either is the owner's or is not, and Google is asked at that one moment.
  it("ignores the development gate", () => {
    expect(ownerEmailMatches({ AUTH_DEV_OPEN: "true" }, "someone@example.com")).toBe(false);
  });
});

describe("ownerGate", () => {
  it("lets the owner in", () => {
    expect(ownerGate(CONFIGURED, session(" Owner@Example.com "), NOW)).toEqual({
      ok: true,
      owner: { via: "session", email: OWNER },
    });
  });

  it("refuses every other address", () => {
    expect(ownerGate(CONFIGURED, session("someone@example.com"), NOW)).toEqual({
      ok: false,
      refusal: "not-the-owner",
    });
  });

  it("refuses a visitor with no session at all", () => {
    expect(ownerGate(CONFIGURED, null, NOW)).toEqual({ ok: false, refusal: "no-session" });
    expect(ownerGate(CONFIGURED, session(null), NOW)).toEqual({
      ok: false,
      refusal: "no-session",
    });
  });

  // The two misconfigurations, told apart, because a refusal in the logs has to say
  // which: a stranger at the door and a deployment missing a variable look identical
  // otherwise.
  it("refuses when no owner is configured", () => {
    expect(ownerGate({}, session(OWNER), NOW)).toEqual({
      ok: false,
      refusal: "no-owner-configured",
    });
    expect(ownerGate({ AUTH_OWNER_EMAIL: "   " }, session(OWNER), NOW)).toEqual({
      ok: false,
      refusal: "no-owner-configured",
    });
  });

  it("refuses an allowlist rather than admitting the first name in it", () => {
    const list = { AUTH_OWNER_EMAIL: `${OWNER},someone@example.com` };
    expect(ownerGate(list, session(OWNER), NOW)).toEqual({
      ok: false,
      refusal: "owner-is-not-singular",
    });
  });

  // Fail closed on the whole environment, not only on the visitor. An unconfigured
  // deployment refuses the owner rather than admitting everybody.
  it("refuses an empty environment", () => {
    expect(ownerGate({}, null, NOW)).toEqual({ ok: false, refusal: "no-owner-configured" });
  });

  it("refuses the owner once the session has outlived its life", () => {
    expect(ownerGate(CONFIGURED, session(OWNER, SESSION_LIFE_IN_SECONDS), NOW)).toEqual({
      ok: false,
      refusal: "session-outlived-its-life",
    });
  });

  // Which refusal comes first matters: an expired session belonging to a stranger is
  // a stranger, and saying so is what keeps the log honest about who knocked.
  it("says a stranger is a stranger even when their session is also too old", () => {
    const stale = {
      email: "someone@example.com",
      openedAt: NOW_IN_SECONDS - 10 * SESSION_LIFE_IN_SECONDS,
    };
    expect(ownerGate(CONFIGURED, stale, NOW)).toEqual({ ok: false, refusal: "not-the-owner" });
  });
});

// The number is stated, and this is the assertion that the
// session does not silently refresh into a longer life than intended: the life is
// counted from the sign-in that opened it, so no amount of using the app extends it.
describe("sessionLifeRemains", () => {
  it("is a 90-day life, stated rather than implied", () => {
    expect(SESSION_LIFE_IN_SECONDS).toBe(7_776_000);
  });

  it("has life left the second the session is opened, and one second before the end", () => {
    expect(sessionLifeRemains(NOW_IN_SECONDS, NOW)).toBe(true);
    expect(sessionLifeRemains(NOW_IN_SECONDS - (SESSION_LIFE_IN_SECONDS - 1), NOW)).toBe(true);
  });

  it("has none left at the end of the life, or after it", () => {
    expect(sessionLifeRemains(NOW_IN_SECONDS - SESSION_LIFE_IN_SECONDS, NOW)).toBe(false);
    expect(sessionLifeRemains(NOW_IN_SECONDS - 2 * SESSION_LIFE_IN_SECONDS, NOW)).toBe(false);
  });

  // The whole point: using the app is not an extension. A session opened 89 days ago
  // is 89 days old however many requests have passed the gate in between, and the day
  // after it is over, not renewed.
  it("counts from the sign-in and not from the last request", () => {
    const openedAt = NOW_IN_SECONDS - SESSION_LIFE_IN_SECONDS + 60;
    const aMinuteLater = NOW + 60_000;

    expect(sessionLifeRemains(openedAt, NOW)).toBe(true);
    expect(sessionLifeRemains(openedAt, aMinuteLater)).toBe(false);
  });

  // An unstamped token is not a new one. A cookie issued before the stamp existed,
  // or one whose claim was dropped, has no life to measure and is refused.
  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "has no life left for the stamp %o",
    (openedAt) => {
      expect(sessionLifeRemains(openedAt, NOW)).toBe(false);
    }
  );

  // A clock ahead of the one that signed the token is not a reason to extend a
  // session; refusing is the direction in which being wrong is free.
  it("has no life left for a session opened in the future", () => {
    expect(sessionLifeRemains(NOW_IN_SECONDS + 3600, NOW)).toBe(false);
  });
});

describe("devGateIsOpen", () => {
  it("opens on the explicit opt-in", () => {
    expect(devGateIsOpen({ AUTH_DEV_OPEN: "true" })).toBe(true);
  });

  // The reason it exists: nothing is hosted at this stage, so there is no Google
  // client to sign in against and no session to carry an address.
  it("lets a request through with no session and no address behind it", () => {
    expect(ownerGate({ AUTH_DEV_OPEN: "true" }, null, NOW)).toEqual({
      ok: true,
      owner: { via: "development-gate", email: null },
    });
  });

  it("stays shut when the flag is absent", () => {
    expect(devGateIsOpen({})).toBe(false);
  });

  // The flag is an opt-in, so only one value opens it. "1", "yes" and "TRUE-ish" read
  // like intent but are not the documented value; whitespace and case are the only
  // slack given.
  it.each(["false", "1", "yes", "", "TRUE-ish"])("stays shut for %o", (value) => {
    expect(devGateIsOpen({ AUTH_DEV_OPEN: value })).toBe(false);
  });

  it.each([" true ", "TRUE", "True"])("opens for %o", (value) => {
    expect(devGateIsOpen({ AUTH_DEV_OPEN: value })).toBe(true);
  });

  // The second lock, and the reason the flag is safe to have in the repo at all: the
  // container runs `next start`, which is a production build, and the flag is dead
  // there whatever it says.
  it("is never honoured in a production build", () => {
    expect(devGateIsOpen({ AUTH_DEV_OPEN: "true", NODE_ENV: "production" })).toBe(false);
    expect(ownerGate({ AUTH_DEV_OPEN: "true", NODE_ENV: "production" }, null, NOW)).toEqual({
      ok: false,
      refusal: "no-owner-configured",
    });
  });

  it("still admits the owner in a production build, by the session door", () => {
    const env = { AUTH_DEV_OPEN: "true", NODE_ENV: "production", AUTH_OWNER_EMAIL: OWNER };
    expect(ownerGate(env, session(OWNER), NOW)).toEqual({
      ok: true,
      owner: { via: "session", email: OWNER },
    });
  });
});
