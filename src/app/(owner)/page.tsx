import Link from "next/link";
import { QUIET } from "@/components/controls";
import { RatingRing } from "@/components/rating-ring";
import { GlassOutline, Silhouette } from "@/components/silhouette";
import { type HeldVintage, heldInTheCellar, readCellar } from "@/core/queries/cellar";
import { type DrunkLabel, listDrunk } from "@/core/queries/drunk";
import { listKinds } from "@/core/queries/kind";
import { listTastings, type TastingEntry } from "@/core/queries/tasting";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { shelves } from "./cellar/shelf";
import {
  byDay,
  dayInShort,
  diaryAt,
  inTheCellar,
  madeAndKind,
  type Shown,
  shownFrom,
  theOccasion,
  whatWasDrunk,
  whatWasThought,
  whenDrunk,
  whoMadeIt,
} from "./diary";
import { dayAsWritten, levelAsWritten, todayAsADay } from "./words";

// THE DIARY (spec §4): what was drunk, in two views. It is the home page because it is what
// the assistant writes and the owner comes to read back.
//
// **By day**, the default: the Tastings, newest first, under the day they were drunk on. Each
// row is what the owner thought — the rating as a ring with its number in it, the name, who
// made it, their own words, the occasion — and the bottle beside it, drawn from its Kind
// (ADR-0012), or a glass for a Tasting that kept no Label (ADR-0005). At the desk a panel beside
// it holds the open Bottles: what is already started is the first thing to drink, and a wine
// does not keep.
//
// **By wine**: each Label drunk, once — its last Rating, how many times it was tasted and when,
// and what is left of it in the Cellar — most recently drunk first, or by Rating. A Label with a
// finished Bottle and no Tasting is there too, so a bottle drunk with nothing recorded does not
// vanish from every page. The loose Tastings come last, under their own heading, one row each:
// they are not a Label, so they are counted in none (ADR-0005), and a row of them among the
// Labels would read as a wine drunk once. The open-bottles panel is not beside this view: every
// row already says what is left of its Label, and the panel would say it twice.
//
// The search, the section, the view and the order are the address (`./diary`), so the page is
// rendered with the answer in it and the back button undoes any of them.

type Asked = Record<string, string | string[] | undefined>;

export default async function DiaryPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const asked = await searchParams;
  const kinds = await listKinds();
  const sections = [...new Set(kinds.map((kind) => kind.section))];
  const shown = shownFrom(asked, sections);
  const today = todayAsADay();

  return (
    <main className="flex max-w-6xl flex-col gap-4 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">Diary</h1>
        <Segments
          label="Show"
          scrolls
          options={[undefined, ...sections].map((name) => ({
            key: name ?? "everything",
            title: name ?? "Everything",
            href: diaryAt(shown, { section: name }),
            on: name === shown.section,
          }))}
        />
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Search shown={shown} />
        <div className="flex items-center justify-between gap-3">
          <Segments
            label="View"
            options={[
              {
                key: "day",
                title: "By day",
                href: diaryAt(shown, { view: "day" }),
                on: shown.view === "day",
              },
              {
                key: "wine",
                title: "By wine",
                href: diaryAt(shown, { view: "wine" }),
                on: shown.view === "wine",
              },
            ]}
          />
          {shown.view === "wine" ? <Order shown={shown} /> : null}
        </div>
      </div>

      {shown.view === "wine" ? (
        <ByWine shown={shown} today={today} />
      ) : (
        <ByDay shown={shown} today={today} />
      )}
    </main>
  );
}

/** A choice of a few, as links: the section, the view. The one shown is raised. */
function Segments({
  label,
  options,
  scrolls,
}: {
  label: string;
  options: { key: string; title: string; href: string; on: boolean }[];
  scrolls?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("min-w-0", scrolls && "-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0")}
    >
      <ul className="flex w-max rounded-xl bg-paper-quiet p-[3px]">
        {options.map((option) => (
          <li key={option.key}>
            <Link
              href={option.href}
              aria-current={option.on ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-[9px] px-3.5 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                option.on
                  ? "bg-paper-raised font-bold text-glass"
                  : "text-glass-quiet hover:text-glass"
              )}
            >
              {option.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The search: one field, posted to the address as `?q=`, carrying the section, the view and
 * the order along so a search narrows what is shown rather than starting over. A search in
 * the address can be cleared from inside the field.
 */
function Search({ shown }: { shown: Shown }) {
  return (
    <search className="flex min-w-0 flex-1">
      <form action="/" className="flex min-w-0 flex-1 gap-2">
        {shown.section ? <input type="hidden" name="section" value={shown.section} /> : null}
        {shown.view === "wine" ? <input type="hidden" name="view" value="wine" /> : null}
        {shown.view === "wine" && shown.sort === "rating" ? (
          <input type="hidden" name="sort" value="rating" />
        ) : null}
        <label
          htmlFor="q"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-rule-field bg-paper-raised pl-3.5 text-glass-quiet focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4" />
          </svg>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={shown.q ?? ""}
            aria-label="Search the diary"
            placeholder="A name, a grape, a place, a dish"
            enterKeyHint="search"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 bg-transparent pr-3.5 text-base text-glass outline-none placeholder:text-glass-quiet/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {shown.q ? (
            <Link
              href={diaryAt(shown, { q: undefined })}
              aria-label="Clear the search"
              className="-my-px grid size-11 shrink-0 place-items-center rounded-r-xl text-glass-quiet outline-none hover:text-glass focus-visible:ring-2 focus-visible:ring-ring"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Link>
          ) : null}
        </label>
        <button type="submit" className={cn(QUIET, "hidden sm:inline-flex")}>
          Search
        </button>
      </form>
    </search>
  );
}

/** By wine's order, as two links: the most recently drunk first, or the best rated. */
function Order({ shown }: { shown: Shown }) {
  return (
    <nav aria-label="Order" className="flex items-center text-sm">
      {(
        [
          ["last", "Last tasted"],
          ["rating", "Rating"],
        ] as const
      ).map(([sort, title]) => {
        const on = shown.sort === sort;
        return (
          <Link
            key={sort}
            href={diaryAt(shown, { sort })}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-lg px-2.5 whitespace-nowrap underline-offset-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? "font-bold text-glass underline decoration-wine decoration-2"
                : "text-glass-quiet hover:text-glass"
            )}
          >
            {title}
          </Link>
        );
      })}
    </nav>
  );
}

async function ByDay({ shown, today }: { shown: Shown; today: string }) {
  const [tastings, cellar] = await Promise.all([
    listTastings({ section: shown.section, text: shown.q }),
    readCellar(),
  ]);
  const days = byDay(tastings);
  const open = shelves(cellar, { what: "open" }).flatMap((shelf) => shelf.items);

  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
      <div className="min-w-0 flex-1">
        {days.length === 0 ? (
          <Empty shown={shown} />
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
        <aside className="hidden w-80 shrink-0 flex-col gap-3 rounded-[18px] bg-paper-raised p-5 lg:mt-5 lg:flex">
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
  );
}

const ROW =
  "grid grid-cols-[48px_minmax(0,1fr)_28px] items-start gap-3.5 py-4 md:grid-cols-[52px_minmax(0,1fr)_28px] md:gap-5";

const ROW_LINK =
  "rounded-lg outline-none transition-colors hover:bg-paper-raised/60 focus-visible:ring-2 focus-visible:ring-ring";

/** The two columns of a row's middle at the desk: what it is, and what is said of it. */
const MIDDLE =
  "flex min-w-0 flex-col gap-1 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:gap-5";

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
      <div className={MIDDLE}>
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

  return entry.label ? (
    <Link href={`/labels/${entry.label.id}`} className={cn(ROW, ROW_LINK)}>
      {body}
    </Link>
  ) : (
    <div className={ROW}>{body}</div>
  );
}

async function ByWine({ shown, today }: { shown: Shown; today: string }) {
  const drunk = await listDrunk({ section: shown.section, text: shown.q, sort: shown.sort });
  const held = await heldInTheCellar(drunk.labels.map((label) => label.id));

  if (drunk.labels.length === 0 && drunk.loose.length === 0) return <Empty shown={shown} />;

  return (
    <div className="min-w-0">
      {drunk.labels.length > 0 ? (
        <ul aria-label="Labels" className="mt-2">
          {drunk.labels.map((label) => (
            <li key={label.id} className="border-t border-rule">
              <WineRow label={label} held={held.get(label.id) ?? []} today={today} />
            </li>
          ))}
        </ul>
      ) : null}

      {drunk.loose.length > 0 ? (
        <section aria-labelledby="loose" className="mt-6">
          <h2
            id="loose"
            className="mb-1.5 font-serif text-[15px] font-medium text-glass-quiet md:text-base"
          >
            Without a label
          </h2>
          <ul>
            {drunk.loose.map((entry) => (
              <li key={entry.id} className="border-t border-rule">
                <LooseRow entry={entry} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * One Label drunk: its last Rating, its name and who made it, how often and when it was
 * tasted — or that a bottle of it was finished with nothing recorded — and what is left of it.
 */
function WineRow({
  label,
  held,
  today,
}: {
  label: DrunkLabel;
  held: HeldVintage[];
  today: string;
}) {
  return (
    <Link href={`/labels/${label.id}`} className={cn(ROW, ROW_LINK)}>
      <RatingRing
        rating={label.lastRating}
        section={label.kind.section}
        className="md:size-[52px]"
      />
      <div className={MIDDLE}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-serif text-lg font-bold leading-snug md:text-xl">{label.name}</span>
          <span className="text-sm leading-snug text-glass-quiet">{madeAndKind(label)}</span>
        </div>
        <div className="mt-1.5 flex min-w-0 flex-col gap-1 md:mt-0">
          <span className="text-[15px] leading-normal">{whenDrunk(label, today)}</span>
          {held.length > 0 ? (
            <span className="text-[13px] text-glass-quiet">{inTheCellar(held)}</span>
          ) : null}
        </div>
      </div>
      <Silhouette
        shape={label.silhouette.shape}
        liquid={label.silhouette.liquid}
        className="h-[84px] w-7"
      />
    </Link>
  );
}

/** A Tasting that kept no Label, on its own: what was known of it, and when (ADR-0005). */
function LooseRow({ entry, today }: { entry: TastingEntry; today: string }) {
  const thought = whatWasThought(entry);
  return (
    <div className={ROW}>
      <RatingRing rating={entry.rating} section={null} className="md:size-[52px]" />
      <div className={MIDDLE}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-serif text-lg font-bold leading-snug md:text-xl">
            {whatWasDrunk(entry)}
          </span>
          <span className="text-sm leading-snug text-glass-quiet">
            Tasted on {dayInShort(entry.tastedOn, today)}
          </span>
        </div>
        {thought ? (
          <span className="mt-1.5 whitespace-pre-line text-[15px] leading-normal md:mt-0">
            {thought}
          </span>
        ) : null}
      </div>
      <GlassOutline className="h-[84px] w-7" />
    </div>
  );
}

/**
 * Nothing to show: a search that found nothing says so and offers to clear it; a section with
 * nothing in it says how to see the rest; an empty diary says where Tastings come from.
 */
function Empty({ shown }: { shown: Shown }) {
  if (shown.q) {
    return (
      <div className="mt-2 flex max-w-prose flex-col gap-2 border-t border-rule pt-6">
        <p className="font-serif text-xl font-bold break-words">
          {shown.section
            ? `Nothing in ${shown.section} matches “${shown.q}”.`
            : `Nothing matches “${shown.q}”.`}
        </p>
        <p className="text-[15px] leading-relaxed text-glass-quiet">
          The search looks at names, producers, places, grapes and Kinds, and at what you wrote
          about each Tasting: the food, the place, the company and your notes.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={diaryAt(shown, { q: undefined })} className={QUIET}>
            Clear the search
          </Link>
          {shown.section ? (
            <Link href={diaryAt(shown, { section: undefined })} className={QUIET}>
              Search everything
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex max-w-prose flex-col gap-2 border-t border-rule pt-6">
      <p className="font-serif text-xl font-bold">
        {shown.section ? "Nothing in this section yet." : "Nothing tasted yet."}
      </p>
      <p className="text-[15px] leading-relaxed text-glass-quiet">
        {shown.section
          ? "Choose Everything to see every Tasting."
          : "Tastings arrive from the assistant: send it a photo of the label and say what you thought, and it records the Tasting here. You can also record one yourself: find the bottle on Add."}
      </p>
      {shown.section ? null : (
        <Link href="/add" className={cn(QUIET, "mt-2 self-start")}>
          Record a tasting
        </Link>
      )}
    </div>
  );
}
