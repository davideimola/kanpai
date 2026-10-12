import type { SourceConsulted } from "@/core/queries/catalogue";
import { Refusal } from "@/core/refusal";
import { SOURCE_TITLE } from "@/core/sources/candidate";
import type { Chosen } from "@/core/verbs/catalogue";
import type { Dating } from "@/core/verbs/vintage";

// WHAT `/add` READS OUT OF WHAT WAS TYPED, and what it says back about each Source. Pure functions
// over plain values, tested beside themselves (`./search.test.ts`); the page and its Server
// Functions stay thin adapters over `searchCatalogue`, `createLabelFromSource` and `createLabel`.

/**
 * One search field takes everything — a name, a producer, the words the phone's text scan read
 * off the label, or a barcode typed or scanned. Digits alone, eight to fourteen of them once the
 * spaces a person types between groups are dropped, are a barcode; anything else is words.
 */
export function whatWasTyped(q: string): { barcode: string } | { query: string } {
  const typed = q.trim();
  const digits = typed.replace(/[\s-]/g, "");
  if (/^\d{8,14}$/.test(digits)) return { barcode: digits };
  return { query: typed };
}

/**
 * The one quiet line a Source gets when it has no candidate to show: off on this copy, did not
 * answer, or knew nothing. `null` when it has candidates, which speak for themselves. Never an
 * error: a Source's silence says nothing about the bottle (ADR-0011).
 */
export function sourceSays(
  consulted: Pick<SourceConsulted, "source" | "state" | "found">,
  typed: { barcode: string } | { query: string }
): string | null {
  const title = SOURCE_TITLE[consulted.source];
  if (consulted.state === "off") {
    return consulted.source === "vivino"
      ? "Vivino is not set up on this copy."
      : "Open Food Facts is turned off on this copy.";
  }
  if (consulted.state === "unavailable") return `${title} did not answer. Try again in a moment.`;
  if (consulted.found > 0) return null;
  return "barcode" in typed
    ? `Nothing on ${title} has that barcode.`
    : `Nothing on ${title} called “${typed.query}”.`;
}

/** A candidate as the address names it — `vivino:1234` — so the panel choosing it is a link. */
export function chosenAsParam(chosen: Chosen): string {
  return `${chosen.source}:${chosen.idAtSource}`;
}

/** The candidate an address names, or `undefined` when it names none. */
export function chosenFrom(param: string | undefined): Chosen | undefined {
  const at = param?.indexOf(":") ?? -1;
  if (!param || at < 1) return undefined;
  const source = param.slice(0, at);
  const idAtSource = param.slice(at + 1).trim();
  if ((source !== "vivino" && source !== "openfoodfacts") || idAtSource === "") return undefined;
  return { source, idAtSource };
}

/**
 * The first Vintage of a Label the owner is making, from what the form said (ADR-0010).
 *
 * A year typed is a year, whatever else was chosen. Otherwise *No year* is NV — the producer
 * blends years — and anything else is unknown: the owner did not say, and unknown is what
 * nobody wrote down. A Kind without vintages has NV and nothing else, so `undefined` lets the
 * verb give it that; a year typed for one is refused rather than dropped, because it is a fact
 * the owner wrote and the record could not keep.
 */
export function firstVintage(said: {
  kind: { name: string; hasVintages: boolean };
  dating: string | null;
  year: string | null;
}): Dating | undefined {
  const year = said.year?.trim() ?? "";
  if (!said.kind.hasVintages) {
    if (year !== "") {
      throw new Refusal(
        "invalid",
        `A ${said.kind.name} has no year: its one Vintage is No year. Leave the year empty.`
      );
    }
    return undefined;
  }
  if (year !== "") {
    if (!/^\d{4}$/.test(year))
      throw new Refusal("invalid", "Write the year as four figures, like 2019.");
    return Number(year);
  }
  return said.dating === "nv" ? "nv" : "unknown";
}

/** Where the owner goes once the Label exists: the act they chose, open on its page. */
export function nextStep(said: string | null): "taste" | "bottles" {
  return said === "bottles" ? "bottles" : "taste";
}
