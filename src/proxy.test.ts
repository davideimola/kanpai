import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SESSION_LIFE_IN_SECONDS } from "@/lib/auth/gate";

// Seam 2 at the edge it is named for: a real HTTP request, a real Auth.js session
// cookie, and the gate's own answer to it.
//
// Nothing is mocked here. The cookie is minted with the same `encode` Auth.js signs
// with and the same secret the gate will decrypt with, which is what lets both
// directions of the gate be exercised **without a Google OAuth client** — the client
// is only how an address gets into a token, and this puts one there directly.
//
// The layer under test is the ergonomic one: it redirects rather than refuses, and
// `lib/auth/owner.test.ts` covers the wall behind it.

const OWNER = "owner@example.com";

// What the deployment is configured with, set **before** the gate is imported: Auth.js
// reads the secret and the client once, when `NextAuth()` runs at module load, and a
// value arriving later would leave it unable to decrypt anything. The client id and
// secret are stand-ins — the test mints its own tokens and reaches no Google.
const SECRET = "a-secret-for-this-test-and-nowhere-else";
process.env.AUTH_SECRET = SECRET;
process.env.AUTH_GOOGLE_ID = "a-client-id-that-reaches-no-google";
process.env.AUTH_GOOGLE_SECRET = "a-client-secret-that-reaches-no-google";

const { proxy } = await import("./proxy");

// The cookie name, which Auth.js also uses as the salt when deriving the encryption
// key. The requests below are https, as a deployed copy's are behind its TLS terminator, so the name
// carries the `__Secure-` prefix; over http it is plain `authjs.session-token`.
const COOKIE = "__Secure-authjs.session-token";

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  process.env = { ...saved };
  delete process.env.AUTH_DEV_OPEN;
  process.env.AUTH_OWNER_EMAIL = OWNER;
});

afterEach(() => {
  process.env = saved;
});

/** A session cookie for `email`, opened `secondsAgo` before now. */
async function cookieFor(email: string, secondsAgo = 0, secret = SECRET): Promise<string> {
  return encode({
    secret,
    salt: COOKIE,
    maxAge: SESSION_LIFE_IN_SECONDS,
    token: {
      email,
      sub: "the-google-account-id",
      openedAt: Math.floor(Date.now() / 1000) - secondsAgo,
    },
  });
}

const HOST = "kanpai.example.com";

/**
 * A request as it reaches the app: the headers a reverse proxy puts in front of it, because
 * Auth.js derives the cookie's `__Secure-` prefix from `x-forwarded-proto` rather than
 * from the URL, and reads no cookie at all when it disagrees with the name.
 */
function requestFor(pathAndQuery: string, cookie?: string): NextRequest {
  const headers = new Headers({
    host: HOST,
    "x-forwarded-host": HOST,
    "x-forwarded-proto": "https",
  });
  if (cookie) headers.set("cookie", `${COOKIE}=${cookie}`);
  return new NextRequest(`https://${HOST}${pathAndQuery}`, { headers });
}

/** A GET of the home page, carrying `cookie` if there is one. */
function get(cookie?: string): NextRequest {
  return requestFor("/", cookie);
}

async function statusAndLocation(request: NextRequest) {
  // The second argument is the `NextFetchEvent` Next passes; nothing in the gate reads
  // it, and Auth.js's wrapper only forwards it.
  const response = await proxy(request, undefined as never);
  return { status: response?.status, location: response?.headers.get("location") };
}

describe("the gate at the HTTP edge", () => {
  it("lets the owner's address through", async () => {
    expect(await statusAndLocation(get(await cookieFor(OWNER)))).toEqual({
      status: 200,
      location: null,
    });
  });

  it("sends every other Google address to the sign-in screen", async () => {
    expect(await statusAndLocation(get(await cookieFor("someone@example.com")))).toEqual({
      status: 307,
      location: "https://kanpai.example.com/signin",
    });
  });

  it("sends a visitor with no cookie to the sign-in screen", async () => {
    expect(await statusAndLocation(get())).toEqual({
      status: 307,
      location: "https://kanpai.example.com/signin",
    });
  });

  // A cookie this deployment cannot decrypt is no cookie at all — which is what
  // rotating `AUTH_SECRET` does to every session at once, the only kill switch there is.
  // Auth.js logs the failed decryption while this test runs; that log *is* the
  // behaviour, and a refusal that said nothing would be the worse outcome.
  it("sends a visitor holding a cookie signed with another secret to the sign-in screen", async () => {
    const foreign = await cookieFor(OWNER, 0, "the-secret-before-the-rotation");

    expect(await statusAndLocation(get(foreign))).toEqual({
      status: 307,
      location: "https://kanpai.example.com/signin",
    });
  });

  // The absolute life, at the edge: the cookie is still valid as far as
  // Auth.js is concerned, and the gate refuses it anyway because the sign-in it
  // records is older than the life.
  it("sends the owner to the sign-in screen once the session has outlived its life", async () => {
    const old = await cookieFor(OWNER, SESSION_LIFE_IN_SECONDS + 1);

    expect(await statusAndLocation(get(old))).toEqual({
      status: 307,
      location: "https://kanpai.example.com/signin",
    });
  });

  it("keeps no query string when it redirects", async () => {
    const request = requestFor("/?kind=red");

    expect((await statusAndLocation(request)).location).toBe(`https://${HOST}/signin`);
  });

  // Fail closed at the edge too: a deployment that forgot the variable refuses the
  // owner rather than admitting everybody.
  it("sends the owner to the sign-in screen when no owner is configured", async () => {
    const cookie = await cookieFor(OWNER);
    delete process.env.AUTH_OWNER_EMAIL;

    expect(await statusAndLocation(get(cookie))).toEqual({
      status: 307,
      location: "https://kanpai.example.com/signin",
    });
  });

  describe("the development gate", () => {
    it("lets a request with no cookie and no Google client through", async () => {
      process.env.AUTH_DEV_OPEN = "true";
      delete process.env.AUTH_OWNER_EMAIL;

      expect(await statusAndLocation(get())).toEqual({ status: 200, location: null });
    });

    it("is dead in a production build", async () => {
      process.env.AUTH_DEV_OPEN = "true";
      Object.assign(process.env, { NODE_ENV: "production" });

      expect(await statusAndLocation(get())).toEqual({
        status: 307,
        location: "https://kanpai.example.com/signin",
      });
    });
  });
});
