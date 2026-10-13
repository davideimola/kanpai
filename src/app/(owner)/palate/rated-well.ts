import { ratingAsWritten } from "@/components/rating-ring";
import type { RatedWell, Tally } from "@/core/queries/tasting";
import { counted } from "../words";

// The aside beside the Palate, in words: what the Tastings rated well have in common, counted
// and never weighed (`whatWasRatedWell`). Pure, and tested beside itself (`./rated-well.test.ts`).

/** Below this many well-rated Tastings, a count says nothing worth reading. */
export const ENOUGH_TO_SAY = 3;

/**
 * `Red (5), Gin (2)` — leaving out what only one Tasting had, which is a bottle and not a
 * pattern, and would let the alphabet pick among the ties.
 */
function tallied(tallies: readonly Tally[]): string {
  return tallies
    .filter((tally) => tally.tastings > 1)
    .map((tally) => `${tally.name} (${tally.tastings})`)
    .join(", ");
}

/**
 * The aside: a heading sentence and up to three lines — Kinds, grapes, regions — or `null`
 * when too few Tastings were rated that well, or they share nothing, to count anything.
 */
export function ratedWellInWords(
  well: RatedWell
): { heading: string; lines: { name: string; said: string }[] } | null {
  if (well.tastings < ENOUGH_TO_SAY) return null;
  const lines = [
    { name: "Kinds", said: tallied(well.kinds) },
    { name: "Grapes", said: tallied(well.grapes) },
    { name: "Regions", said: tallied(well.regions) },
  ].filter((line) => line.said !== "");
  if (lines.length === 0) return null;
  return {
    heading: `Of the ${counted(well.tastings, "Tasting")} you rated ${ratingAsWritten(well.atLeast)} or more:`,
    lines,
  };
}
