import { listKinds } from "@/core/queries/kind";
import { signOutOwner } from "@/lib/auth/actions";
import { requireOwner } from "@/lib/auth/owner";

// THE HOME PAGE, AS THE SCAFFOLD LEAVES IT: the Kinds, read out of Postgres on the request.
//
// It is S0's whole proof — container, migration, core module, gate and page connected end to
// end — and nothing more. The diary of Tastings replaces it in S4 (spec §4); until then this
// is the one screen, and seeing eleven Kinds on it means the path works.

export default async function HomePage() {
  const owner = await requireOwner();
  const kinds = await listKinds();

  // The sections in the order their first Kind is offered in, so a new section (a beer)
  // appears where its rows sort, with no list of sections written down here.
  const sections = [...new Set(kinds.map((kind) => kind.section))].map((section) => ({
    section,
    kinds: kinds.filter((kind) => kind.section === section),
  }));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 py-10 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
          kanpai
        </h1>
        {/* The way out exists only where there is a session to leave: with the development
            gate open there is none, and a sign-out there would be a button that lies. */}
        {owner.via === "session" ? (
          <form action={signOutOwner}>
            <button
              type="submit"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Sign out
            </button>
          </form>
        ) : null}
      </header>

      <p className="border-t border-border pt-4 text-sm leading-relaxed">
        The Kinds a Label can be. Nothing has been recorded yet.
      </p>

      {sections.map(({ section, kinds: inSection }, index) => (
        <section key={section} aria-labelledby={`section-${index}`}>
          <h2 id={`section-${index}`} className="text-sm font-medium">
            {section}
          </h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {inSection.map((kind) => (
              <li key={kind.id} className="py-2 text-sm">
                {kind.name}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
