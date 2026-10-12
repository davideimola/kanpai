import type { TastingEntry } from "@/core/queries/tasting";
import { vintageAsWritten } from "./words";

// THE DIARY'S READING OF A TASTING: what the row says, worked out from the entry and tested
// beside it (`./diary.test.ts`). The page is markup over these; the query is `listTastings`.

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
