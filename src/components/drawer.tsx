import Link from "next/link";

import { cn } from "@/lib/utils";

// THE DRAWER: a panel over the screen holding a form the owner opened on purpose — and its
// open state is the address, not a script. tsundoku's, taken over with the stack (ADR-0001).
//
// The trigger is a `<Link>` to `?panel=…`, the panel is rendered on the server when that
// parameter is there, and every way out is a link back to the address without it. So an open
// drawer survives a refresh, the back gesture shuts it, and it works with nothing running in
// the browser. What it does not have is a focus trap: *Close* is the first thing in it, and
// the scrim and the back gesture are the other two ways out.
//
// A refusal about what was typed into it is printed **in here**, beside the fields: a sentence
// left on the page behind a panel is a sentence the owner cannot read.

export function Drawer({
  title,
  description,
  refused,
  closesTo,
  children,
}: {
  title: string;
  description?: string;
  /** A verb's own words about the press that just happened. */
  refused?: string;
  /** The screen's own address with no panel on it. */
  closesTo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50">
      {/* The ground behind, dimmed, and a link: tapping away from a panel shuts it. No name
          of its own — *Close* below is the control a screen reader should find. */}
      <Link
        href={closesTo}
        aria-hidden
        tabIndex={-1}
        scroll={false}
        className="absolute inset-0 bg-glass/30 backdrop-blur-[2px]"
      />

      {/* From the bottom on a phone, from the right at the desk. */}
      <section
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-y-auto rounded-t-3xl bg-paper",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[32rem] sm:rounded-none sm:rounded-l-3xl",
          "motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-200 sm:motion-safe:slide-in-from-right"
        )}
      >
        <div
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-rule sm:hidden"
        />

        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-rule bg-paper px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-serif text-xl font-bold">{title}</h2>
            {description ? (
              <p className="mt-1 text-pretty text-sm text-glass-quiet">{description}</p>
            ) : null}
          </div>
          <Link
            href={closesTo}
            scroll={false}
            className="-mr-2 -mt-1 flex min-h-11 shrink-0 items-center rounded-xl px-3 text-[15px] font-medium text-glass-quiet outline-none hover:text-glass focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </Link>
        </header>

        <div className="px-5 py-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {refused ? <Refused className="mb-5">{refused}</Refused> : null}
          {children}
        </div>
      </section>
    </div>
  );
}

/** A refusal, in the one hue spent on nothing else. */
export function Refused({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn("rounded-xl bg-refusal/10 px-4 py-3 text-[15px] text-refusal", className)}
    >
      {children}
    </p>
  );
}

/** What just happened, said once, quietly. */
export function Said({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="status" className={cn("rounded-xl bg-paper-quiet px-4 py-3 text-[15px]", className)}>
      {children}
    </p>
  );
}
