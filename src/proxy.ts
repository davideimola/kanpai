import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import type { NextAuthRequest } from "next-auth";

import { auth } from "@/lib/auth";
import { devGateIsOpen, gateSessionFrom, ownerGate, SIGN_IN_PATH } from "@/lib/auth/gate";

// The first of the gate's two layers, and the one that is **ergonomics rather than
// the wall**. It exists so that a request without a session lands on a sign-in screen
// instead of an error; the thing that actually refuses is `requireOwner()`, for the
// reasons written down beside it.
//
// Everything below asks `@/lib/auth/gate` for the verdict, exactly as the wall does.
// Two layers, one predicate — so they cannot come to different conclusions about who
// the owner is or about how long a session lives.

// The development gate is answered *before* Auth.js is touched. That is not an
// optimisation: with the flag on there is no `AUTH_SECRET` and no Google client to
// resolve a session against, which is what lets the local loop in the README run with
// nothing hosted and no human step.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (devGateIsOpen(process.env)) return NextResponse.next();
  return gatedProxy(request, event);
}

// `auth()` as a wrapper resolves the session and hands it over as `request.auth`.
//
// Both parameters are annotated on purpose: `auth` is overloaded for route handlers as
// well, and a one-parameter callback resolves to that overload instead of this one.
const gatedProxy = auth((request: NextAuthRequest, _event: NextFetchEvent) => {
  if (ownerGate(process.env, gateSessionFrom(request.auth)).ok) return NextResponse.next();

  // No `callbackUrl`. The app has one home, and a sign-in happens about once a
  // quarter, so returning to the refused route is not worth an open-redirect surface
  // fed by a query parameter.
  const signIn = request.nextUrl.clone();
  signIn.pathname = SIGN_IN_PATH;
  signIn.search = "";
  return NextResponse.redirect(signIn);
});

export const config = {
  // Everything is gated except a short list, and each entry is load-bearing:
  //
  //   - **`api/auth`**, Auth.js's own endpoints. A gated sign-in endpoint is a gate
  //     that can never be opened.
  //   - **`signin`**, the one screen a non-owner may see.
  //   - **`mcp`**, the other door. It takes tokens the owner issues rather than Google
  //     (ADR-0009), and a redirect to a Google consent screen is not an answer an
  //     assistant can read. Reserved here so the slice that builds it (S2) does not have
  //     to edit this line.
  //   - **`.well-known`**, the prefix RFC 8615 reserves for metadata a machine fetches
  //     *before* it has any credentials to fetch it with. Nothing is served under it yet,
  //     and gated it would answer a discovery probe `307 /signin` where a `404` correctly
  //     says "this server publishes none" — which is what tsundoku's tunnel learned the
  //     hard way, and what OAuth for MCP (S10) will publish under it.
  //   - **the build output and the favicon**, which the browser fetches unprompted and
  //     **without credentials**.
  //   - **the icons and the manifest**, for exactly that last reason and no new one. A
  //     manifest is fetched with credentials *omitted* unless the link asks otherwise — so
  //     gated it answers `307 /signin`, and the phone silently never offers to install the
  //     app. Nothing under them is the owner's data: an application's name and its logo are
  //     already on the sign-in screen.
  //
  // `/api` is deliberately **not** excluded as a prefix: `api/auth` lives under it, and a
  // prefix-wide hole is one every later route falls into without anybody deciding it should.
  //
  // Every named path is anchored to a path boundary. Unanchored they would also excuse
  // anything merely *starting* with those letters — `/api/authors`, `/mcp-token`,
  // `/.well-known-ish`, `/icon.svg.map` — which is a wider hole than the reservation: the
  // exclusion is for these paths, not for these prefixes.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|(?:api/auth|signin|mcp|\\.well-known|icon\\.svg|apple-icon\\.png|manifest\\.webmanifest)(?:$|/)).*)",
  ],
};
