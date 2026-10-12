// The owner gate's verdict, as a pure function of the environment and one session.
//
// The gate exists at two levels: `src/proxy.ts` redirects, and `requireOwner()`
// refuses. The proxy is ergonomics, the assert is the wall — but the two must never
// disagree about *who the owner is*, so both of them ask this module and nothing
// else. It is deliberately pure: no `process.env` read, no Auth.js import, no I/O.
// That is what makes the fail-closed behaviour a table of cases rather than an
// argument, and it is why "both directions" costs one test file.
//
// Nothing here is domain vocabulary. *Owner*, *gate* and *session* are
// infrastructure, not the language of the cellar, which is why `CONTEXT.md` carries
// none of these words.

/** Where the proxy sends a request it refuses, and where Auth.js is pointed too. */
export const SIGN_IN_PATH = "/signin";

/**
 * How long a session lives, counted from the sign-in that opened it: **90 days,
 * absolute**.
 *
 * Absolute is the whole point. Auth.js's JWT strategy re-signs the token every time
 * the session is resolved and appends the resulting `Set-Cookie` to the response, so
 * `maxAge` alone is not "how long the session lasts" but "how long the app can go
 * unopened" — open the app once a month and the cookie never expires. That is a
 * session silently refreshing into a longer life than intended, which the gate rules
 * out, so the moment the gate was opened is stamped into the token at
 * sign-in and the life is measured from there. Nothing moves it forward; only a new
 * sign-in, which is a deliberate act and a round trip to Google, opens a new one.
 *
 * 90 days because the app is opened phone-in-hand at a table or in a wine shop, and
 * being logged out there is the failure that matters. The cookie's own `maxAge` is set to the
 * same number, so the two cannot drift into a cookie that outlives the gate.
 */
export const SESSION_LIFE_IN_SECONDS = 90 * 24 * 60 * 60;

/**
 * The slice of the environment the gate reads, named as a type so a caller can hand
 * in a literal in a test and `process.env` in production, and so the three variables
 * the gate depends on are listed in one place.
 *
 * The index signature is what makes `process.env` assignable: TypeScript refuses a
 * dictionary against a type whose every property is optional.
 */
export type GateEnv = {
  readonly AUTH_DEV_OPEN?: string;
  readonly AUTH_OWNER_EMAIL?: string;
  readonly NODE_ENV?: string;
  readonly [variable: string]: string | undefined;
};

/**
 * Why the gate refused. Carried on the error the wall throws, so a refusal in the
 * logs says which of the five things went wrong — a misconfigured deployment and a
 * stranger at the door look identical otherwise.
 */
export type GateRefusal =
  | "no-owner-configured"
  | "owner-is-not-singular"
  | "no-session"
  | "not-the-owner"
  | "session-outlived-its-life";

/**
 * Who got through, and by which of the two doors. `development-gate` carries no
 * address on purpose: the flag opens the gate *without* Google, so there is no
 * identity behind it and pretending otherwise would invent one.
 */
export type Owner = { via: "session"; email: string } | { via: "development-gate"; email: null };

export type GateVerdict = { ok: true; owner: Owner } | { ok: false; refusal: GateRefusal };

/**
 * What the gate is told about the visitor: the address Google vouched for, and the
 * second in which the sign-in that opened this session happened.
 *
 * Both are optional because both come out of a token the gate did not write. An
 * absent `openedAt` is an unstamped session — a cookie from before the stamp existed, or
 * one whose claim was dropped — and it is refused rather than treated as new.
 */
export type GateSession = {
  readonly email?: string | null;
  readonly openedAt?: number | null;
};

/**
 * What the gate reads out of a session Auth.js resolved.
 *
 * Both layers need exactly this, and having it once means the proxy and the wall
 * cannot come to read a *different* two facts out of the same cookie. It takes
 * `unknown`-ish shapes because that is what a resolved session is: an object whose
 * every field is optional, or nothing at all.
 */
export function gateSessionFrom(
  session: { user?: { email?: string | null } | null; openedAt?: number } | null | undefined
): GateSession | null {
  if (!session) return null;
  return { email: session.user?.email, openedAt: session.openedAt };
}

/**
 * The development gate: `AUTH_DEV_OPEN=true`, and **never** honoured in a
 * production build.
 *
 * Nothing is hosted at this stage: there is no Google OAuth client, no client id and
 * no secret, and there will not be one until the owner makes it. Without this flag
 * the local loop the README documents would end at a sign-in button that cannot
 * work, so every slice after S0 would be locked out of its own screens.
 *
 * Opening the gate is therefore an **act** rather than the absence of a
 * configuration: a gate that opened by itself whenever `AUTH_GOOGLE_ID` was missing
 * would open the owner's whole record to anyone with the URL the day a variable was
 * misspelled in a deployment. The condition on `NODE_ENV` is the second lock, and it
 * is structural rather than remembered: the container runs `next start`, which is a
 * production build, and the flag is dead there whatever it says.
 */
export function devGateIsOpen(env: GateEnv): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.AUTH_DEV_OPEN?.trim().toLowerCase() === "true";
}

/**
 * Does this address belong to the one configured owner?
 *
 * Used by Auth.js's `signIn` callback, where the development gate is irrelevant: a
 * sign-in either is the owner's or is not. `ownerGate()` is the version that also
 * knows about the flag.
 */
export function ownerEmailMatches(env: GateEnv, email: string | null | undefined): boolean {
  const owner = configuredOwner(env);
  if (!owner.ok) return false;
  return normalizeEmail(email) === owner.email;
}

/**
 * The whole verdict: the development gate first, then the one configured owner
 * against the session's address, then the life the session was issued with.
 *
 * Fail closed at every step. An unset `AUTH_OWNER_EMAIL` refuses rather than letting
 * anyone in, and it is checked *before* the session so that a misconfigured
 * deployment says so instead of blaming the visitor.
 *
 * `now` is a parameter and not a call to the clock, because "this session is too old"
 * is the one rule here that a test cannot state without saying when it is.
 */
export function ownerGate(
  env: GateEnv,
  session: GateSession | null,
  now: number = Date.now()
): GateVerdict {
  if (devGateIsOpen(env)) return { ok: true, owner: { via: "development-gate", email: null } };

  const owner = configuredOwner(env);
  if (!owner.ok) return { ok: false, refusal: owner.refusal };

  const candidate = normalizeEmail(session?.email);
  if (candidate === null) return { ok: false, refusal: "no-session" };
  if (candidate !== owner.email) return { ok: false, refusal: "not-the-owner" };
  if (!sessionLifeRemains(session?.openedAt, now)) {
    return { ok: false, refusal: "session-outlived-its-life" };
  }

  return { ok: true, owner: { via: "session", email: candidate } };
}

/**
 * Is a session opened at `openedAt` still inside its life at `now`?
 *
 * Seconds, because that is the unit of the JWT claims this number sits beside;
 * `now` is milliseconds, because that is what `Date.now()` gives and converting once
 * here is better than converting at three call sites.
 *
 * An absent, malformed or negative stamp has no life left. So does one in the
 * future: a clock that disagrees with the one that signed the token is not a reason
 * to extend a session, and this is the direction in which being wrong is free.
 */
export function sessionLifeRemains(openedAt: number | null | undefined, now: number): boolean {
  if (typeof openedAt !== "number" || !Number.isFinite(openedAt) || openedAt <= 0) return false;

  const age = Math.floor(now / 1000) - openedAt;
  return age >= 0 && age < SESSION_LIFE_IN_SECONDS;
}

// `AUTH_OWNER_EMAIL` is singular, and this is where that stays true. A
// comma-separated allowlist is a second account in a new hat — the thing this app is
// single-owner in order not to have — so a value carrying a comma is a
// misconfiguration and not a list: it refuses rather than quietly admitting the first
// name in it.
function configuredOwner(
  env: GateEnv
): { ok: true; email: string } | { ok: false; refusal: GateRefusal } {
  const configured = env.AUTH_OWNER_EMAIL?.trim();
  if (!configured) return { ok: false, refusal: "no-owner-configured" };
  if (configured.includes(",")) return { ok: false, refusal: "owner-is-not-singular" };
  return { ok: true, email: configured.toLowerCase() };
}

function normalizeEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}
