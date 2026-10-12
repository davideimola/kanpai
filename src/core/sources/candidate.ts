import "server-only";

import type { SourceName } from "../verbs/source.ts";

// What a Source proposes, in one shape whichever Source it came from (ADR-0011).
//
// A **candidate** is not a Label and not a match. Every Source measured answers a miss with a
// confident, plausible, wrong record — a mineral water for *Rocca Sveva*, Hendrick's for the
// owner's *Hedonya Gin* (`docs/research/sources.md`) — so nothing here is ever picked
// automatically: the owner or the assistant chooses one, and only then does it become a Label
// (`verbs/catalogue.ts`).

/** One record a Source holds, mapped onto our vocabulary as far as the Source allows. */
export type Candidate = {
  source: SourceName;
  /** The Source's own id: an Open Food Facts barcode, a Vivino wine id. */
  idAtSource: string;
  /** The producer, or the brand where that is all the Source has. `null` when it has neither. */
  producer: string | null;
  name: string;
  /**
   * A Kind's id the record looks like, or `null`. A hint only: Vivino types Havana Club 7 as
   * a red wine, so the assistant confirms the Kind with the owner rather than trusting it.
   */
  kind: string | null;
  /** In English: "Italy". */
  country: string | null;
  region: string | null;
  appellation: string | null;
  /**
   * The grapes, by name. Empty from both Sources today: Vivino's search carries grape *ids*
   * only, and Open Food Facts has no grape field.
   */
  grapes: string[];
  /** Alcohol by volume, in percent, when the Source states one. */
  strength: number | null;
  /** The years the Source knows a Vintage for, newest first, and `"nv"` when it has one. */
  vintages: (number | "nv")[];
  /** Hotlinked, never fetched by us (ADR-0011). */
  imageUrl: string | null;
  pageUrl: string;
  /** Who to credit beside the image or the facts: Open Food Facts' are CC BY-SA. */
  attribution: string;
};

/** A Source as the catalogue asks it: by words, and by its own id. */
export type Source = {
  readonly name: SourceName;
  /** Candidates for what was typed, best first by the Source's own ranking. */
  search(text: string): Promise<Candidate[]>;
  /** One record re-read by its id, or `null` when the Source has no such record. */
  byId(id: string): Promise<Candidate | null>;
};

/**
 * The Sources this copy asks. `null` is a Source that is **off** on this copy — Vivino unless
 * its owner configured it, Open Food Facts when its owner turned it off — which is not the same
 * as a Source that did not answer (`SourceUnavailable`).
 */
export type Sources = { openfoodfacts: Source | null; vivino: Source | null };

/** How a Source is named to the owner. */
export const SOURCE_TITLE: Record<SourceName, string> = {
  openfoodfacts: "Open Food Facts",
  vivino: "Vivino",
};

/**
 * A Source that was asked and did not answer: a timeout, a refusal, a page that is not JSON.
 * *No answer*, never *no such bottle* (ADR-0011) — the search goes on without it.
 */
export class SourceUnavailable extends Error {
  readonly source: SourceName;
  constructor(source: SourceName, reason: string, options: { cause?: unknown } = {}) {
    super(reason, { cause: options.cause });
    this.name = "SourceUnavailable";
    this.source = source;
  }
}

/**
 * The words of a text, as the producer filter compares them: accents and case folded, split on
 * anything that is not a letter or a digit, words of one letter dropped.
 */
export function wordsOf(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

// Two words are the same word when they are equal, or when one starts the other and the shorter
// has four letters at least: *Hendricks* typed finds *Hendrick's* split at its apostrophe, and
// *Mas* (Viña Costera) does not pass for *Masi*.
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/**
 * Whether a candidate shares a word with what names the bottle's producer or brand.
 *
 * The filter that keeps a craft bottle from being stored as a famous one: asked for *Hedonya
 * Gin*, both Sources answer with Hendrick's, Tanqueray and Gin Mare, matching on *gin* alone.
 * `distinctive` is the producer's words, or the query's without the generic ones (the Kinds'
 * names); a candidate that has none of them in its producer or name is discarded.
 */
export function namesTheProducer(candidate: Candidate, distinctive: readonly string[]): boolean {
  if (distinctive.length === 0) return true;
  const own = wordsOf(`${candidate.producer ?? ""} ${candidate.name}`);
  return distinctive.some((word) => own.some((theirs) => sameWord(word, theirs)));
}
