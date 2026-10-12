import "server-only";

import { devGateIsOpen, type GateRefusal, gateSessionFrom, type Owner, ownerGate } from "./gate";
import { auth } from "./index";

// The wall. Not the proxy — this.
//
// Next's own proxy reference says a Server Function is a POST to the route where it
// is used rather than a route of its own, so "a matcher change or a refactor that
// moves a Server Function to a different route can silently remove Proxy coverage",
// and its data security guide adds that a page-level check does not extend to the
// Server Functions defined in it. CVE-2025-29927 is the proof that the proxy layer has
// already failed once in the field, bypassed by a spoofed header. So the proxy is
// ergonomics — it turns a refusal into a sign-in screen — and this is the thing that
// refuses.
//
// Every page and every Server Function behind the gate calls this first, and
// `src/app/gated.test.ts` fails when one of them stops doing so.
//
// It **throws** rather than redirecting, and the visitor of a bypassed proxy therefore
// sees an error rather than the sign-in screen. That is the intended shape: the
// friendly answer is the proxy's job, this layer only has to be certain, and a wall
// that also had an opinion about where to send people would be a second destination to
// drift from the first. A refusal reaching here at all means the layer in front of it
// failed, which is a thing to see and not to smooth over.

export class OwnerGateError extends Error {
  readonly refusal: GateRefusal;

  constructor(refusal: GateRefusal) {
    super(`The owner gate refused this call: ${refusal}.`);
    this.name = "OwnerGateError";
    this.refusal = refusal;
  }
}

/**
 * Refuse unless the caller is the owner. Returns who got through, so a screen that
 * shows the signed-in identity does not need a second look at the session.
 *
 * The verdict is `ownerGate()`'s and nobody else's — the same predicate the proxy
 * asks, so the two layers cannot disagree about who the owner is. The one thing
 * decided here is whether to go and *resolve* a session first: with the development
 * gate open there is no `AUTH_SECRET` and no Google client to resolve one against, so
 * Auth.js is never touched at all.
 */
export async function requireOwner(): Promise<Owner> {
  const session = devGateIsOpen(process.env) ? null : await auth();

  const verdict = ownerGate(process.env, gateSessionFrom(session));
  if (!verdict.ok) throw new OwnerGateError(verdict.refusal);
  return verdict.owner;
}
