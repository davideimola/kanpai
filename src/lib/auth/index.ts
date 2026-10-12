import NextAuth from "next-auth";
// Imported for its types alone: the augmentation below needs the module resolved.
import "next-auth/jwt";
import Google from "next-auth/providers/google";

import { ownerEmailMatches, SESSION_LIFE_IN_SECONDS, SIGN_IN_PATH } from "./gate";

// Google through Auth.js, allowlisted by one address (ADR-0001, ADR-0008). GitHub joins it
// as a second provider, chosen by environment, in the self-host kit (S9). This is a pure
// "is this the owner?" gate and not a data layer: the app reaches Postgres through
// `src/core` with the one `DATABASE_URL` regardless of who is signed in, so nothing
// downstream reads the session except the gate itself. That is also why none of this
// lives in `src/core` — the core module knows nothing about HTTP or sessions
// (`src/core/README.md`).

// The moment the sign-in happened, in seconds, as the JWT carries it. Declared on the
// session because the wall reads it from `auth()` and a cast at that call site would
// be a promise instead of a type.
declare module "next-auth" {
  interface Session {
    openedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    openedAt?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // A copy is served on its own domain behind a TLS terminator of its own, so the host
  // the request arrives with is the host to build callbacks from.
  trustHost: true,
  providers: [Google],
  // JWT, so Google is contacted exactly once — at sign-in. A self-contained token has
  // no access token to expire and no refresh token to race, which is what keeps a
  // phone at the table signed in without a session table. The accepted cost is that a
  // single session cannot be revoked from a table; the kill switch is rotating
  // `AUTH_SECRET`, which is also why a sign-out affordance exists at all.
  //
  // `maxAge` is the cookie's ceiling and not the gate's: Auth.js re-signs the token on
  // every resolution, so this alone would roll forward for ever. The life the gate
  // enforces is measured from `openedAt` below.
  session: { strategy: "jwt", maxAge: SESSION_LIFE_IN_SECONDS },
  // One destination for the gate. Auth.js's own errors land here too rather than on
  // its default error page, because this is the only screen a non-owner may see.
  pages: { signIn: SIGN_IN_PATH, error: SIGN_IN_PATH },
  callbacks: {
    // The allowlist, applied at the one moment Google is contacted. `authorized` is
    // deliberately not defined: with a proxy of our own, two callbacks deciding the
    // same question would be two places to drift — see `src/proxy.ts`.
    signIn({ profile }) {
      return ownerEmailMatches(process.env, profile?.email);
    },

    // Stamp the sign-in into the token, once. `account` is present only on the call
    // that follows a real round trip to Google, so this is the moment a session is
    // opened and every later re-signing carries the original number forward untouched
    // — which is what makes the 90 days a life rather than an idle window.
    jwt({ token, account }) {
      if (account) token.openedAt = Math.floor(Date.now() / 1000);
      return token;
    },

    // Hand the stamp to the gate. Without this the session the wall resolves would
    // carry an address and no age, and the life could not be enforced.
    session({ session, token }) {
      session.openedAt = token.openedAt;
      return session;
    },
  },
});
