"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlyphFor } from "@/components/glyphs";
import { Mark } from "@/components/mark";
import { cn } from "@/lib/utils";
import {
  currentDestination,
  DESTINATIONS,
  type Destination,
  inTheHeader,
  onTheBar,
} from "./navigation";

// THE SHELL: every screen in the group is rendered inside it. Two shapes of one map
// (`./navigation`): a rail at the desk, and on a phone a bar along the bottom — where a thumb
// is — with the two chores, *To check* and *Settings*, in the header above the page.
//
// The two swap at `md` (768px): the rail costs fifteen rems, which a tablet held upright
// can spare, and a bar under a page that wide is a long way from either thumb.
//
// A client component for one reason: `usePathname`, so the navigation says where the owner is
// without them reading the address. It renders on the server like everything else, every
// control in it is a link or a plain form, and nothing in it needs a script to work.

/** The house's focus ring, which every control on every screen carries. */
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function Shell({
  unverified,
  signOut,
  children,
}: Readonly<{
  /** How many Labels wait on the to-check page. */
  unverified: number;
  /** The way out, where there is a session to leave; `null` with the development gate open. */
  signOut: React.ReactNode;
  children: React.ReactNode;
}>) {
  const here = currentDestination(usePathname());

  return (
    <>
      <div className="md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
        <Rail here={here} unverified={unverified} signOut={signOut} />
        <div className="min-w-0">
          <PhoneHeader here={here} unverified={unverified} />
          {/* Room for the bar the phone floats over the page. */}
          <div className="pb-28 md:pb-0">{children}</div>
        </div>
      </div>
      <PhoneBar here={here} />
    </>
  );
}

/** The brand: the mark and the word, linking home. */
function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-xl font-serif text-xl font-bold",
        FOCUS,
        className
      )}
    >
      <Mark className="size-8" />
      kanpai
    </Link>
  );
}

/** How many Labels wait, in the quiet ink: a count, never an alarm. */
function Count({ of }: { of: number }) {
  if (of === 0) return null;
  return (
    <span className="min-w-5 rounded-full bg-paper-quiet px-1.5 text-center text-xs font-bold leading-5 text-glass">
      <span className="sr-only">, </span>
      {of}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/** The desk: a rail that is always there, with every destination named. */
function Rail({
  here,
  unverified,
  signOut,
}: {
  here: string | undefined;
  unverified: number;
  signOut: React.ReactNode;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-7 border-r border-rule bg-paper-raised px-4 py-7 md:flex">
      <Brand className="px-2.5" />
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {DESTINATIONS.map((destination) => (
          <RailRow
            key={destination.href}
            destination={destination}
            current={here === destination.href}
            count={destination.counted ? unverified : 0}
          />
        ))}
      </nav>
      {signOut}
    </aside>
  );
}

function RailRow({
  destination,
  current,
  count,
}: {
  destination: Destination;
  current: boolean;
  count: number;
}) {
  return (
    <Link
      href={destination.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors",
        current
          ? "bg-paper-quiet font-bold text-wine"
          : "font-medium text-glass hover:bg-paper-quiet/60",
        FOCUS
      )}
    >
      <GlyphFor href={destination.href} className="size-5" />
      <span className="flex-1">{destination.label}</span>
      <Count of={count} />
    </Link>
  );
}

/** The phone's header: the brand, and the chores at the right. */
function PhoneHeader({ here, unverified }: { here: string | undefined; unverified: number }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-3 md:hidden">
      <Brand />
      <nav aria-label="More" className="flex items-center gap-1">
        {inTheHeader().map((destination) => {
          const count = destination.counted ? unverified : 0;
          return (
            <Link
              key={destination.href}
              href={destination.href}
              aria-current={here === destination.href ? "page" : undefined}
              aria-label={count > 0 ? `${destination.label}, ${count} waiting` : destination.label}
              className={cn(
                "relative grid size-11 place-items-center rounded-xl",
                here === destination.href ? "bg-paper-quiet text-wine" : "text-glass-quiet",
                FOCUS
              )}
            >
              <GlyphFor href={destination.href} className="size-[22px]" />
              {count > 0 ? (
                <span
                  aria-hidden
                  className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-wine-fill px-1 text-center text-[11px] font-bold leading-[18px] text-on-wine"
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** The phone's bar: the places, and the act as a round button in the middle when it exists. */
function PhoneBar({ here }: { here: string | undefined }) {
  const tabs = onTheBar();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul
        className="grid px-1.5 pb-2 pt-1.5"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((destination) => (
          <li key={destination.href} className="min-w-0">
            {destination.phone === "act" ? (
              <Link
                href={destination.href}
                aria-label={destination.label}
                aria-current={here === destination.href ? "page" : undefined}
                className={cn("flex min-h-13 items-center justify-center rounded-xl", FOCUS)}
              >
                <span className="grid size-12 place-items-center rounded-full bg-wine-fill text-on-wine">
                  <GlyphFor href={destination.href} className="size-[22px]" />
                </span>
              </Link>
            ) : (
              <Link
                href={destination.href}
                aria-current={here === destination.href ? "page" : undefined}
                className={cn(
                  "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-xl text-xs",
                  here === destination.href
                    ? "font-bold text-wine"
                    : "font-medium text-glass-quiet",
                  FOCUS
                )}
              >
                <GlyphFor href={destination.href} className="size-6" />
                {destination.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
