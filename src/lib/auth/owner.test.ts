import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Seam 2's other half: the wall, with the one thing it cannot compute for itself —
// the session Auth.js resolves out of a cookie — standing in as a mock. Everything
// else here is the real code: the predicate, the refusal, the environment it reads.
const auth = vi.hoisted(() => vi.fn());
vi.mock("./index", () => ({ auth }));

import { SESSION_LIFE_IN_SECONDS } from "./gate";
import { OwnerGateError, requireOwner } from "./owner";

const OWNER = "owner@example.com";

/** Signed in as `email`, by a sign-in `secondsAgo` before now. */
function signedInAs(email: string | null, secondsAgo = 0) {
  auth.mockResolvedValue(
    email === null
      ? null
      : { user: { email }, openedAt: Math.floor(Date.now() / 1000) - secondsAgo }
  );
}

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  // A clean environment per test: the gate reads three variables and one leaked from
  // the shell is the difference between passing and failing closed.
  process.env = { ...saved };
  delete process.env.AUTH_DEV_OPEN;
  delete process.env.AUTH_OWNER_EMAIL;
  auth.mockReset();
});

afterEach(() => {
  process.env = saved;
});

describe("requireOwner", () => {
  it("returns the owner when the session carries the configured address", async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER;
    signedInAs(" Owner@Example.com ");

    await expect(requireOwner()).resolves.toEqual({ via: "session", email: OWNER });
  });

  it("refuses an unauthenticated call", async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER;
    signedInAs(null);

    await expect(requireOwner()).rejects.toThrow(OwnerGateError);
    await expect(requireOwner()).rejects.toMatchObject({ refusal: "no-session" });
  });

  it("refuses a signed-in stranger", async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER;
    signedInAs("someone@example.com");

    await expect(requireOwner()).rejects.toMatchObject({ refusal: "not-the-owner" });
  });

  // Fail closed: an unconfigured deployment refuses the owner rather than admitting
  // everyone who happens to hold a Google account.
  it("refuses when no owner is configured, session or not", async () => {
    signedInAs(OWNER);
    await expect(requireOwner()).rejects.toMatchObject({ refusal: "no-owner-configured" });
  });

  it("refuses a comma-separated allowlist", async () => {
    process.env.AUTH_OWNER_EMAIL = `${OWNER},someone@example.com`;
    signedInAs(OWNER);

    await expect(requireOwner()).rejects.toMatchObject({ refusal: "owner-is-not-singular" });
  });

  it("refuses the owner's own session once it has outlived its life", async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER;
    signedInAs(OWNER, SESSION_LIFE_IN_SECONDS + 1);

    await expect(requireOwner()).rejects.toMatchObject({
      refusal: "session-outlived-its-life",
    });
  });

  // A cookie Auth.js still accepts but that carries no stamp — one issued before the
  // stamp existed. It is not a fresh session and is not treated as one.
  it("refuses a session that carries no sign-in moment", async () => {
    process.env.AUTH_OWNER_EMAIL = OWNER;
    auth.mockResolvedValue({ user: { email: OWNER } });

    await expect(requireOwner()).rejects.toMatchObject({
      refusal: "session-outlived-its-life",
    });
  });

  describe("the development gate", () => {
    it("opens with no session and no Google client", async () => {
      process.env.AUTH_DEV_OPEN = "true";

      await expect(requireOwner()).resolves.toEqual({ via: "development-gate", email: null });
    });

    // The reason the branch exists rather than the gate simply admitting whatever
    // `auth()` returns: with the flag on there is no `AUTH_SECRET` to resolve a
    // session against, so Auth.js must not be reached at all.
    it("never resolves a session", async () => {
      process.env.AUTH_DEV_OPEN = "true";
      await requireOwner();

      expect(auth).not.toHaveBeenCalled();
    });

    it("closes again in a production build", async () => {
      process.env.AUTH_DEV_OPEN = "true";
      // `NODE_ENV` is typed readonly, and this is a copy of the environment made in
      // `beforeEach` rather than the real one.
      Object.assign(process.env, { NODE_ENV: "production" });
      process.env.AUTH_OWNER_EMAIL = OWNER;
      signedInAs(null);

      await expect(requireOwner()).rejects.toMatchObject({ refusal: "no-session" });
    });
  });
});
