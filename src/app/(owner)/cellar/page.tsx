import Link from "next/link";
import { QUIET } from "@/components/controls";
import { Silhouette } from "@/components/silhouette";
import { readCellar } from "@/core/queries/cellar";
import { listKinds } from "@/core/queries/kind";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { counted, openAsWritten, vintageAsWritten } from "../words";
import { chips, type ShelfItem, sameShow, shelves, showFrom, showParam, tally } from "./shelf";

// THE CELLAR (spec §4): the Bottles in the house, closed or open — what can be drunk tonight.
//
// Shelves, one per section, with the bottles standing on a rule (`./shelf`). A closed Bottle is
// drawn full and an open one holds what is left of it (ADR-0012), so the shelf is read the way
// a real one is. Every item opens its Label's page, where the Bottles are opened, finished and
// corrected.
//
// The filters are links, not state: `?show=open`, `?show=Wine`. The page is rendered on the
// server with the answer already in it, and the back button undoes a filter.

type Asked = Record<string, string | string[] | undefined>;

export default async function CellarPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [cellar, kinds, asked] = await Promise.all([readCellar(), listKinds(), searchParams]);
  const sections = [...new Set(kinds.map((kind) => kind.section))];
  const show = showFrom(typeof asked.show === "string" ? asked.show : undefined, [
    ...sections,
    ...cellar.map((section) => section.section),
  ]);
  const { bottles, open } = tally(cellar);
  const onShelves = shelves(cellar, show);

  return (
    <main className="flex max-w-6xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">Cellar</h1>
          <p className="text-[15px] text-glass-quiet">
            {bottles === 0
              ? "Nothing in the house yet."
              : `${counted(bottles, "bottle")}, ${open === 0 ? "none" : open} of them open`}
          </p>
        </div>
        {/* Bottles come home from a shop: find the Label on Add, then Add bottles on it. */}
        <Link href="/add" className={cn(QUIET, "mt-1 md:mt-2")}>
          Add bottles
        </Link>
      </header>

      <nav aria-label="Show" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 pb-1">
          {chips(cellar, sections).map((chip) => {
            const on = sameShow(chip.show, show);
            const param = showParam(chip.show);
            return (
              <li key={chip.label}>
                <Link
                  href={param ? `/cellar?${new URLSearchParams({ show: param })}` : "/cellar"}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    on
                      ? "border-glass bg-glass font-bold text-paper"
                      : "border-rule-field font-medium text-glass hover:bg-paper-quiet"
                  )}
                >
                  {chip.label}
                  <span className="text-[12.5px] opacity-75">{chip.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {onShelves.length === 0 ? (
        <Empty bottles={bottles} />
      ) : (
        onShelves.map((shelf, index) => (
          <section key={shelf.section} aria-labelledby={`shelf-${index}`}>
            <h2
              id={`shelf-${index}`}
              className={cn(
                "mt-3 flex items-baseline gap-3 font-serif text-[19px] font-bold md:text-2xl",
                show.what === "section" && "sr-only"
              )}
            >
              <span className="flex-1">{shelf.section}</span>
              <span className="font-sans text-[13px] font-normal text-glass-quiet">
                {show.what === "open" ? `${shelf.bottles} open` : counted(shelf.bottles, "bottle")}
              </span>
            </h2>
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-y-4 md:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] md:gap-y-6">
              {shelf.items.map((item) => (
                <li key={item.key} className="min-w-0">
                  <Item item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

/** One thing on the shelf: the bottle standing on its rule, then its name, Kind and year. */
function Item({ item }: { item: ShelfItem }) {
  const open = item.level !== null;
  const detail = item.level ? openAsWritten(item.level) : vintageAsWritten(item.vintage);
  const many = item.count > 1;

  return (
    <Link
      href={`/labels/${item.label.id}`}
      className="group relative flex flex-col items-center gap-1.5 rounded-xl text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* The shelf: the rule every bottle in the row stands on. */}
      <span className="flex h-[92px] w-full items-end justify-center border-b-2 border-rule md:h-[140px]">
        <Silhouette
          shape={item.label.silhouette.shape}
          liquid={item.label.silhouette.liquid}
          level={item.level}
          className="h-[82px] w-[27px] motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 md:h-[126px] md:w-[42px]"
        />
      </span>
      {many ? (
        <span className="absolute top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-paper-quiet px-1.5 text-[11.5px] font-bold">
          <span aria-hidden>×{item.count}</span>
          <span className="sr-only">, {item.count} bottles</span>
        </span>
      ) : null}
      <span className="flex w-full flex-col items-center gap-px px-0.5">
        <span className="w-full truncate text-[13px] font-medium leading-snug md:text-sm">
          {item.label.name}
        </span>
        <span className="text-xs leading-snug text-glass-quiet">{item.label.kind.name}</span>
        <span className={cn("text-xs leading-snug", open ? "text-wine" : "text-glass-quiet")}>
          {detail}
        </span>
      </span>
    </Link>
  );
}

function Empty({ bottles }: { bottles: number }) {
  return (
    <div className="flex max-w-prose flex-col gap-2 border-t border-rule pt-6">
      <p className="font-serif text-xl font-bold">
        {bottles === 0 ? "The shelves are empty." : "Nothing to show here."}
      </p>
      <p className="text-[15px] leading-relaxed text-glass-quiet">
        {bottles === 0
          ? "Bottles arrive when you tell the assistant you bought some, or when you add them yourself: search for the bottle on Add, by its name or its barcode. Finished ones leave the Cellar and stay on their Label as history."
          : "No Bottle in the house matches this. Choose Everything to see the whole Cellar."}
      </p>
      {bottles === 0 ? (
        <Link href="/add" className={cn(QUIET, "mt-2 self-start")}>
          Add a bottle
        </Link>
      ) : null}
    </div>
  );
}
