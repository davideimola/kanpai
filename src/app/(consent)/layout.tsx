// The `(consent)` group: OAuth's consent screen (ADR-0013), **behind the gate and without the
// chrome**. The third group, beside `(owner)` and `(public)`, and gated exactly as `(owner)` is —
// the proxy covers its path, its page and its Server Functions call `requireOwner()`, and
// `src/app/gated.test.ts` holds both.
//
// It exists because a layout cannot be left: a page under `(owner)` is drawn inside the shell,
// with the navigation, the Cellar and the count of Labels to check. The consent screen is a
// stop on the way back to another app — one question, two buttons — and a navigation beside it
// would invite the owner to wander off from an app still waiting for its answer.

// Never prerendered, for the reason `(owner)/layout.tsx` gives: everything here answers a
// session.
export const dynamic = "force-dynamic";

export default function ConsentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
