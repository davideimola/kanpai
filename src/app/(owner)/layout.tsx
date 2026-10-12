import { PLAIN } from "@/components/controls";
import { countUnverifiedLabels } from "@/core/queries/label";
import { signOutOwner } from "@/lib/auth/actions";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { Shell } from "./shell";

// The `(owner)` group. **Everything that reads the owner's record lives here** — this is
// the group the proxy's matcher covers and the group whose pages `src/app/gated.test.ts`
// requires to call `requireOwner()`. A new screen goes in here; see the README.
//
// The wall does **not** live in this layout: a layout does not run for a Server Function,
// which is why each page and each `actions.ts` calls it. This layout puts the chrome on
// (`./shell`), and reads the one number the chrome carries — how many Labels wait to be
// checked — which is the owner's record too, so it asks the wall first like any page.

// Every gated response carries a `Set-Cookie`, so it can never be cached. Forcing the
// whole group dynamic means no route under it can be prerendered by accident —
// including a screen a later slice adds that reads nothing and would otherwise qualify,
// and which would then ship one visitor's session inside a static payload. It is also
// what lets the image build with no database (`Dockerfile`, decision 1).
export const dynamic = "force-dynamic";

export default async function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const owner = await requireOwner();
  const unverified = await countUnverifiedLabels();

  // The way out exists only where there is a session to leave: with the development gate
  // open there is none, and a sign-out there would be a button that lies.
  const signOut =
    owner.via === "session" ? (
      <form action={signOutOwner}>
        <button type="submit" className={cn(PLAIN, "w-full justify-start text-glass-quiet")}>
          Sign out
        </button>
      </form>
    ) : null;

  return (
    <Shell unverified={unverified} signOut={signOut}>
      {children}
    </Shell>
  );
}
