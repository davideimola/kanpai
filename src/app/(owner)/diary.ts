import type { DrunkLabel } from "@/core/queries/drunk";
import type { TastingEntry } from "@/core/queries/tasting";
import {
  dateAsWritten,
  heldInWords,
  numberAsWritten,
  tastedTimes,
  vintageAsWritten,
} from "./words";

// THE DIARY'S READING OF A TASTING: what the row says, worked out from the entry and tested
// beside it (`./diary.test.ts`). The page is markup over these; the queries are `listTastings`
// and, for *By wine*, `listDrunk`.

/** The Tastings of one day, under the day's heading. */
export type Day = { day: string; entries: TastingEntry[] };

/** The Tastings, newest first, grouped by the day they were drunk on, in the order given. */
export function byDay(entries: readonly TastingEntry[]): Day[] {
  const days: Day[] = [];
  for (const entry of entries) {
    const last = days.at(-1);
    if (last?.day === entry.tastedOn) last.entries.push(entry);
    else days.push({ day: entry.tastedOn, entries: [entry] });
  }
  return days;
}

/**
 * What was drunk, as the row's title: the Label's name, or — for a Tasting with no Label —
 * the first line of what was known of it (ADR-0005).
 */
export function whatWasDrunk(entry: TastingEntry): string {
  if (entry.label) return entry.label.name;
  return (entry.description ?? "").split("\n")[0]?.trim() || "Something with no name";
}

/**
 * The line under the name: the producer, the appellation (or the region), and the Vintage —
 * `Masi, Amarone della Valpolicella Classico, 2019`. A loose Tasting says it kept no Label.
 */
export function whoMadeIt(entry: TastingEntry): string {
  if (!entry.label) return "No label kept";
  const parts = [entry.label.producer, entry.label.appellation ?? entry.label.region];
  if (entry.vintage) parts.push(vintageAsWritten(entry.vintage));
  return parts.filter((part): part is string => Boolean(part)).join(", ");
}

/**
 * What the owner thought, in one passage: the guided answer *did you like it* first, because it
 * is the one that says the most; then the notes, then what it reminded them of, then the body.
 */
export function whatWasThought(entry: TastingEntry): string | null {
  return entry.likedIt ?? entry.notes ?? entry.remindedOf ?? entry.bodyAndFeel ?? null;
}

/**
 * The occasion, in one phrase: `With braised beef, at home, with Anna`. The food leads because
 * the fourth guided answer is the food (`CONTEXT.md`, **Rating**).
 */
export function theOccasion(
  entry: Pick<TastingEntry, "food" | "place" | "company">
): string | null {
  const parts = [
    entry.food ? `with ${entry.food}` : null,
    entry.place ? `at ${entry.place}` : null,
    entry.company ? `with ${entry.company}` : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  const phrase = parts.join(", ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// THE DIARY'S ADDRESS: what is shown is the address, never state in the browser — the search
// (`?q=`), the section (`?section=Wine`), the view (`?view=wine`, *By day* when absent) and, in
// *By wine*, the order (`?sort=rating`, last tasted when absent). Every link on the page is one
// of these with one thing changed, so a filter, a view and a search combine, and the back
// button undoes any of them.

/** *By day*, the Tastings under their days; *By wine*, each Label drunk once. */
export type View = "day" | "wine";

/** In *By wine*: the most recently drunk first, or the highest last Rating first. */
export type Sort = "last" | "rating";

export type Shown = { q?: string; section?: string; view: View; sort: Sort };

/** What the address asks for, with anything it should not be read as dropped. */
export function shownFrom(
  asked: Record<string, string | string[] | undefined>,
  sections: readonly string[]
): Shown {
  const one = (name: string) => {
    const value = asked[name];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const section = one("section");
  return {
    q: one("q"),
    section: section !== undefined && sections.includes(section) ? section : undefined,
    view: one("view") === "wine" ? "wine" : "day",
    sort: one("sort") === "rating" ? "rating" : "last",
  };
}

/**
 * The address of the diary showing `shown` with `change` made. The defaults are left out, so
 * the plain diary is `/`; the order is only said in *By wine*, the one view that has one.
 */
export function diaryAt(shown: Shown, change: Partial<Shown> = {}): string {
  const next = { ...shown, ...change };
  const query = new URLSearchParams();
  if (next.q) query.set("q", next.q);
  if (next.section) query.set("section", next.section);
  if (next.view === "wine") {
    query.set("view", "wine");
    if (next.sort === "rating") query.set("sort", "rating");
  }
  const said = query.toString();
  return said ? `/?${said}` : "/";
}

/**
 * When a Label was drunk, in *By wine*: `Tasted twice, last on 12 October`; for a Label with
 * finished Bottles and no Tasting, `Finished on 15 September, no tasting recorded` — the line
 * that keeps such a bottle from vanishing without a word.
 */
export function whenDrunk(
  label: Pick<DrunkLabel, "tasted" | "lastTastedOn" | "finished" | "lastFinishedOn">,
  today: string
): string {
  if (label.tasted > 0 && label.lastTastedOn) {
    const on = dayInShort(label.lastTastedOn, today);
    return label.tasted === 1
      ? `Tasted once, on ${on}`
      : `${tastedTimes(label.tasted)}, last on ${on}`;
  }
  const on = label.lastFinishedOn ? ` on ${dayInShort(label.lastFinishedOn, today)}` : "";
  const what =
    label.finished === 1
      ? `Finished${on}`
      : `${capitalised(numberAsWritten(label.finished))} bottles finished, the last${on}`;
  return `${what}, no tasting recorded`;
}

/** Who made a Label and what it is, in one line: `Vietti, Red`. */
export function madeAndKind(label: Pick<DrunkLabel, "producer" | "kind">): string {
  return [label.producer, label.kind.name].filter(Boolean).join(", ");
}

/** A day the database wrote, `2026-10-12`, as a short date: `12 October`. */
export function dayInShort(day: string, today: string): string {
  return dateAsWritten(new Date(`${day}T00:00:00Z`), today);
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What is left of a Label, in *By wine*: `In the Cellar: two bottles of 2019.` — `heldInWords`,
 * the sentence `/add` writes, behind a lead-in, since here it sits under when it was drunk.
 */
export function inTheCellar(held: Parameters<typeof heldInWords>[0]): string {
  const words = heldInWords(held);
  return `In the Cellar: ${words.charAt(0).toLowerCase()}${words.slice(1)}`;
}
