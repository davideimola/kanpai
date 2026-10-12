import Link from "next/link";
import { RatingRing } from "@/components/rating-ring";
import { GlassOutline, Silhouette } from "@/components/silhouette";
import { readCellar } from "@/core/queries/cellar";
import { listKinds } from "@/core/queries/kind";
import { listTastings, type TastingEntry } from "@/core/queries/tasting";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { shelves } from "./cellar/shelf";
import { byDay, theOccasion, whatWasDrunk, whatWasThought, whoMadeIt } from "./diary";
import { dayAsWritten, levelAsWritten, todayAsADay } from "./words";

// THE DIARY (spec §4): the Tastings, newest first, under the day they were drunk on. It is the
// home page because it is what the assistant writes and the owner comes to read back.
//
// Each row is what the owner thought — the rating as a ring with its number in it, the name,
// who made it, their own words, the occasion — and the bottle beside it, drawn from its Kind
// (ADR-0012), or a glass for a Tasting that kept no Label (ADR-0005). A row with a Label opens
// its page, where everything the assistant wrote can be corrected.
//
// At the desk a panel beside it holds the open Bottles: what is already started is the first
// thing to drink, and a wine does not keep.
//
// The section filter is a link, `?section=Wine`, so the page is rendered with the answer in it.

type Asked = Record<string, string | string[] | undefined>;

export default async function DiaryPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const asked = await searchParams;
  const kinds = await listKinds();
  const sections = [...new Set(kinds.map((kind) => kind.section))];
  const section =
    typeof asked.section === "string" && sections.includes(asked.section)
      ? asked.section
      : undefined;

  const [tastings, cellar] = await Promise.all([listTastings({ section }), readCellar()]);
  const days = byDay(tastings);
  const today = todayAsADay();
  const open = shelves(cellar, { what: "open" }).flatMap((shelf) => shelf.items);

  return (
    <main className="flex max-w-6xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">Diary</h1>
        <nav aria-label="Show" className="-mx-4 min-w-0 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max rounded-xl bg-paper-quiet p-[3px]">
            {[undefined, ...sections].map((name) => {
              const on = name === section;
              return (
                <li key={name ?? "everything"}>
                  <Link
                    href={name ? `/?${new URLSearchParams({ section: name })}` : "/"}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-[9px] px-3.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "bg-paper-raised font-bold text-glass"
                        : "text-glass-quiet hover:text-glass"
                    )}
                  >
                    {name ?? "Everything"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
        <div className="min-w-0 flex-1">
          {days.length === 0 ? (
            <Empty filtered={section !== undefined} />
          ) : (
            days.map(({ day, entries }) => (
              <section key={day} aria-label={dayAsWritten(day, today)}>
                <h2 className="mt-5 mb-1.5 font-serif text-[15px] font-medium text-glass-quiet md:text-base">
                  {dayAsWritten(day, today)}
                </h2>
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.id} className="border-t border-rule">
                      <Row entry={entry} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {open.length > 0 ? (
          <aside className="hidden w-80 shrink-0 flex-col gap-3 rounded-[18px] bg-paper-raised p-5 lg:flex">
            <h2 className="font-serif text-xl font-bold">Open bottles</h2>
            <p className="text-sm leading-normal text-glass-quiet">
              An open wine keeps a few days. A spirit keeps for months.
            </p>
            <ul className="flex flex-wrap gap-x-1 gap-y-4 pt-1.5">
              {open.map((item) => (
                <li key={item.key} className="w-[4.5rem]">
                  <Link
                    href={`/labels/${item.label.id}`}
                    className="flex flex-col items-center gap-2 rounded-xl text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-[92px] w-full items-end justify-center border-b-2 border-rule">
                      <Silhouette
                        shape={item.label.silhouette.shape}
                        liquid={item.label.silhouette.liquid}
                        level={item.level}
                        className="h-[84px] w-7"
                      />
                    </span>
                    <span className="flex w-full flex-col gap-0.5">
                      <span className="truncate text-[12.5px] font-medium leading-snug">
                        {item.label.name}
                      </span>
                      <span className="text-[11.5px] text-wine">
                        {item.level ? levelAsWritten(item.level) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </main>
  );
}

/** One Tasting: the ring, the name and who made it, the owner's words, the bottle. */
function Row({ entry }: { entry: TastingEntry }) {
  const thought = whatWasThought(entry);
  const occasion = theOccasion(entry);

  const body = (
    <>
      <RatingRing
        rating={entry.rating}
        section={entry.label?.kind.section}
        className="md:size-[52px]"
      />
      <div className="flex min-w-0 flex-col gap-1 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:gap-5">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-serif text-lg font-bold leading-snug md:text-xl">
            {whatWasDrunk(entry)}
          </span>
          <span className="text-sm leading-snug text-glass-quiet">{whoMadeIt(entry)}</span>
        </div>
        <div className="mt-1.5 flex min-w-0 flex-col gap-1 md:mt-0">
          {thought ? (
            <span className="whitespace-pre-line text-[15px] leading-normal">{thought}</span>
          ) : null}
          {occasion ? <span className="text-[13px] text-glass-quiet">{occasion}</span> : null}
        </div>
      </div>
      {entry.label ? (
        <Silhouette
          shape={entry.label.silhouette.shape}
          liquid={entry.label.silhouette.liquid}
          className="h-[84px] w-7"
        />
      ) : (
        <GlassOutline className="h-[84px] w-7" />
      )}
    </>
  );

  const layout =
    "grid grid-cols-[48px_minmax(0,1fr)_28px] items-start gap-3.5 py-4 md:grid-cols-[52px_minmax(0,1fr)_28px] md:gap-5";

  return entry.label ? (
    <Link
      href={`/labels/${entry.label.id}`}
      className={cn(
        layout,
        "rounded-lg outline-none transition-colors hover:bg-paper-raised/60 focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={layout}>{body}</div>
  );
}

function Empty({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex max-w-prose flex-col gap-2 border-t border-rule pt-6">
      <p className="font-serif text-xl font-bold">
        {filtered ? "Nothing in this section yet." : "Nothing tasted yet."}
      </p>
      <p className="text-[15px] leading-relaxed text-glass-quiet">
        {filtered
          ? "Choose Everything to see every Tasting."
          : "Tastings arrive from the assistant: send it a photo of the label and say what you thought, and it records the Tasting here. You can also record one from a Label's page."}
      </p>
    </div>
  );
}
