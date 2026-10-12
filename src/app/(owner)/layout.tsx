// The `(owner)` group. **Everything that reads the owner's record lives here** — this is
// the group the proxy's matcher covers and the group whose pages `src/app/gated.test.ts`
// requires to call `requireOwner()`. A new screen goes in here; see the README.
//
// Note that the wall does **not** live in this layout. A layout does not run for a
// Server Function, which is why the assert is called by each page and each `actions.ts`
// instead. This layout is where the chrome will be put on, and nothing else; there is no
// chrome yet, because there is one screen.

// Every gated response carries a `Set-Cookie`, so it can never be cached. Forcing the
// whole group dynamic means no route under it can be prerendered by accident —
// including a screen a later slice adds that reads nothing and would otherwise qualify,
// and which would then ship one visitor's session inside a static payload. It is also
// what lets the image build with no database (`Dockerfile`, decision 1).
export const dynamic = "force-dynamic";

export default function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
