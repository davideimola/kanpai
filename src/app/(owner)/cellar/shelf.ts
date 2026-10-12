import type { CellarBottle, CellarSection } from "@/core/queries/cellar";

// THE CELLAR AS SHELVES: what `readCellar` answers, laid out the way the screen shows it, and
// tested beside it (`./shelf.test.ts`).
//
// **One shelf per section**, not per Kind: a red, a white and a sparkling stand together on
// the wine shelf, each saying its Kind under its name, because what the owner asks of a
// Cellar is *what can I open tonight* and the section is the first half of that answer.
//
// **An open Bottle is always its own item**, because its Level is what matters about it and two
// open Bottles of one Vintage hold different amounts. **Closed Bottles of one Vintage are one
// item with a count**: three identical untouched bottles are one fact, *three of these*.

/** What the owner chose to see: everything, only the open Bottles, or one section. */
export type Show = { what: "everything" } | { what: "open" } | { what: "section"; section: string };

/** One thing on a shelf: an open Bottle, or the closed Bottles of one Vintage. */
export type ShelfItem = {
  /** Stable across renders: the Bottle's id when open, the Vintage's when closed. */
  key: string;
  label: CellarBottle["label"];
  vintage: CellarBottle["vintage"];
  /** The open Bottle's Level; `null` for closed ones. */
  level: CellarBottle["level"];
  /** How many Bottles the item stands for — one, for an open one. */
  count: number;
};

export type Shelf = { section: string; items: ShelfItem[]; bottles: number };

/** A filter chip: what it shows, and how many Bottles that is. */
export type Chip = { show: Show; label: string; count: number };

/** What `?show=` says, read against what there is: anything else is everything. */
export function showFrom(asked: string | undefined, sections: readonly string[]): Show {
  if (asked === "open") return { what: "open" };
  if (asked && sections.includes(asked)) return { what: "section", section: asked };
  return { what: "everything" };
}

/** The `?show=` value a chip links to; `undefined` for everything, which is the bare page. */
export function showParam(show: Show): string | undefined {
  if (show.what === "open") return "open";
  if (show.what === "section") return show.section;
  return undefined;
}

export function sameShow(a: Show, b: Show): boolean {
  return showParam(a) === showParam(b);
}

/** The shelves, one per section that has something to show, in the Cellar's order. */
export function shelves(cellar: readonly CellarSection[], show: Show): Shelf[] {
  return cellar
    .filter((section) => show.what !== "section" || section.section === show.section)
    .map((section) => {
      const bottles = section.bottles.filter(
        (bottle) => show.what !== "open" || bottle.state === "open"
      );
      return { section: section.section, items: itemsOf(bottles), bottles: bottles.length };
    })
    .filter((shelf) => shelf.items.length > 0);
}

function itemsOf(bottles: readonly CellarBottle[]): ShelfItem[] {
  const items: ShelfItem[] = [];
  const closedByVintage = new Map<string, ShelfItem>();

  for (const bottle of bottles) {
    if (bottle.state === "open") {
      items.push({
        key: bottle.id,
        label: bottle.label,
        vintage: bottle.vintage,
        level: bottle.level,
        count: 1,
      });
      continue;
    }
    const grouped = closedByVintage.get(bottle.vintage.id);
    if (grouped) {
      grouped.count += 1;
      continue;
    }
    const item: ShelfItem = {
      key: bottle.vintage.id,
      label: bottle.label,
      vintage: bottle.vintage,
      level: null,
      count: 1,
    };
    closedByVintage.set(bottle.vintage.id, item);
    items.push(item);
  }
  return items;
}

/** How many Bottles are in the house, and how many of them are open. */
export function tally(cellar: readonly CellarSection[]): { bottles: number; open: number } {
  const all = cellar.flatMap((section) => section.bottles);
  return { bottles: all.length, open: all.filter((bottle) => bottle.state === "open").length };
}

/**
 * The chips: *Everything*, *Open*, then one per section — every section a Kind names, in the
 * Kinds' order, so the third one is there with its 0 rather than appearing the day a sake does.
 */
export function chips(cellar: readonly CellarSection[], sections: readonly string[]): Chip[] {
  const { bottles, open } = tally(cellar);
  const named = [...new Set([...sections, ...cellar.map((section) => section.section)])];
  return [
    { show: { what: "everything" }, label: "Everything", count: bottles },
    { show: { what: "open" }, label: "Open", count: open },
    ...named.map((section) => ({
      show: { what: "section", section } as const,
      label: section,
      count: cellar.find((s) => s.section === section)?.bottles.length ?? 0,
    })),
  ];
}
