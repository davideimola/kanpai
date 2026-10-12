"use server";

import { SIGN_IN_PATH } from "./gate";
import { signIn, signOut } from "./index";

// The two acts of the gate. Both are Server Functions because both set a cookie, and
// both end in a redirect thrown by Auth.js.

/**
 * The one button on `/signin`.
 *
 * Sign-in always lands on the home page rather than on the route that was refused:
 * the proxy's redirect deliberately carries no `callbackUrl`, so there is no
 * visitor-supplied destination to validate here.
 */
export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

/**
 * The way out, and the reason it exists: changing `AUTH_OWNER_EMAIL` does not
 * invalidate a cookie already issued, and ending the session is how the holder of a
 * stale one leaves that state without touching the deployment.
 *
 * It deliberately does **not** call `requireOwner()`. Gating it on being the owner
 * would lock in exactly the person who needs it, and it writes a cookie and touches no
 * data, so the wall it would otherwise sit behind has nothing to defend here.
 */
export async function signOutOwner() {
  await signOut({ redirectTo: SIGN_IN_PATH });
}
