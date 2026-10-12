import "server-only";

import { query } from "../db.ts";
import { Refusal } from "../refusal.ts";
import {
  type Candidate,
  namesTheProducer,
  SOURCE_TITLE,
  type Source,
  type Sources,
  SourceUnavailable,
  wordsOf,
} from "../sources/candidate.ts";
import { isBarcode } from "../sources/openfoodfacts.ts";
import type { SourceName } from "../verbs/source.ts";
import { type FoundLabel, searchLabels } from "./label.ts";

// The question asked before anything is created: *is this bottle already here, and if not,
// who knows it?* (ADR-0004, ADR-0011). It crosses areas — our Labels, then the Sources — so it
// is named after the question rather than put in `label.ts` (see `../README.md`).
//
// **Our Labels first, always.** Then the Sources, in the order the Kind names
// (`kinds.first_source`): Vivino first for wine, grappa and sake, Open Food Facts first for
// everything else; a barcode goes to Open Food Facts alone. What comes back from a Source is a
// list of **candidates**, never a match — see `../sources/candidate.ts`.

/** What one Source did for this search. */
export type SourceConsulted = {
  source: SourceName;
  /**
   * `consulted`: asked, and it answered (perhaps with nothing). `off`: not enabled on this
   * copy. `unavailable`: asked, and it did not answer — which says nothing about the bottle.
   */
  state: "consulted" | "off" | "unavailable";
  /** How many of its candidates are in the answer, after the producer filter. */
  found: number;
  /** Why it was unavailable, or what turns it on. */
  reason?: string;
};

/** A candidate, and the Label of ours that already holds that record, if one does. */
export type CatalogueCandidate = Candidate & { label: string | null };

export type CatalogueAnswer = {
  /** Our own Labels, as `searchLabels` ranks them — or, for a barcode, the Label holding it. */
  labels: FoundLabel[];
  /** The Sources' candidates, ordered for the Kind; empty when no Source was asked. */
  candidates: CatalogueCandidate[];
  sources: SourceConsulted[];
  /** Candidates dropped because they share no word with the producer or brand searched for. */
  discarded: number;
};

export type CatalogueSearch = {
  /** What was read or said: the name, with or without the producer. */
  query?: string;
  /** The producer or brand, when it is known apart from the name. */
  producer?: string;
  /** A Kind's id: which Source is asked first. Without one, both are interleaved. */
  kind?: string;
  /** A barcode read off the bottle. */
  barcode?: string;
  /** At most this many of our Labels. */
  limit?: number;
  /** At most this many candidates. */
  candidates?: number;
};

const OFF_REASON: Record<SourceName, string> = {
  openfoodfacts: "turned off on this copy (SOURCES_OPENFOODFACTS=false)",
  vivino:
    "not enabled on this copy: its owner sets VIVINO_ALGOLIA_APP_ID and VIVINO_ALGOLIA_KEY to turn it on",
};

// Words that name what a bottle *is* rather than who made it, beside the Kinds' own names
// (read from the rows): a query of *Hedonya Gin* must be filtered on *Hedonya*, not on *gin*.
const GENERIC = ["wine", "wines", "vino", "the", "and"];

/**
 * Search our Labels, then the Sources this copy has, for what was read off a bottle.
 *
 * Never picks: every candidate is a proposal to confirm. A Source that is off or does not
 * answer is reported in `sources` and the search goes on without it.
 */
export async function searchCatalogue(
  sources: Sources,
  search: CatalogueSearch
): Promise<CatalogueAnswer> {
  const barcode = search.barcode?.trim();
  const text = [search.producer, search.query]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (!barcode && text === "") {
    throw new Refusal(
      "invalid",
      "Search for something: the words read off the label, or a barcode."
    );
  }
  if (barcode && !isBarcode(barcode)) {
    throw new Refusal("invalid", "A barcode is the 8 to 14 digits under the bars.");
  }

  const kinds = await query<{ id: string; name: string; firstSource: SourceName }>(
    `select id, name, first_source as "firstSource" from kinds`
  );
  const kind = search.kind === undefined ? undefined : kinds.find((one) => one.id === search.kind);
  if (search.kind !== undefined && !kind) throw new Refusal("not-found", "No Kind has that id.");

  // A barcode names one record exactly, and only Open Food Facts reads barcodes.
  const order: SourceName[] = barcode
    ? ["openfoodfacts"]
    : kind?.firstSource === "openfoodfacts"
      ? ["openfoodfacts", "vivino"]
      : ["vivino", "openfoodfacts"];
  const interleaved = !barcode && !kind;

  const [labels, answers] = await Promise.all([
    barcode ? labelsHolding("openfoodfacts", barcode) : searchLabels(text, search.limit),
    Promise.all(
      order.map((name) =>
        ask(sources[name], name, (source) =>
          barcode
            ? source.byId(barcode).then((one) => (one ? [one] : []))
            : source.search(
                name === "openfoodfacts" && search.producer ? (search.query ?? text) : text
              )
        )
      )
    ),
  ]);

  // The producer filter: a candidate must share a word with the producer named, or with the
  // query's words that are not generic. A barcode is exact and needs none.
  const generic = new Set([...GENERIC, ...kinds.flatMap((one) => wordsOf(one.name))]);
  const distinctive = barcode
    ? []
    : search.producer
      ? wordsOf(search.producer)
      : wordsOf(text).filter((word) => !generic.has(word));

  let discarded = 0;
  const kept = answers.map((answer) => {
    const named = answer.candidates.filter((one) => namesTheProducer(one, distinctive));
    discarded += answer.candidates.length - named.length;
    return named;
  });

  const ordered = (interleaved ? interleave(kept) : kept.flat()).slice(0, search.candidates ?? 10);
  const known = new Set(kinds.map((one) => one.id));
  const candidates = await withOurLabels(
    ordered.map((one) => ({ ...one, kind: one.kind && known.has(one.kind) ? one.kind : null }))
  );

  return {
    labels,
    candidates,
    sources: answers.map((answer) => ({
      ...answer.consulted,
      found: candidates.filter((one) => one.source === answer.consulted.source).length,
    })),
    discarded,
  };
}

type Answer = { consulted: SourceConsulted; candidates: Candidate[] };

async function ask(
  source: Source | null,
  name: SourceName,
  question: (source: Source) => Promise<Candidate[]>
): Promise<Answer> {
  if (!source) {
    return {
      consulted: { source: name, state: "off", found: 0, reason: OFF_REASON[name] },
      candidates: [],
    };
  }
  try {
    return {
      consulted: { source: name, state: "consulted", found: 0 },
      candidates: await question(source),
    };
  } catch (error) {
    if (!(error instanceof SourceUnavailable)) throw error;
    return {
      consulted: {
        source: name,
        state: "unavailable",
        found: 0,
        reason: `${SOURCE_TITLE[name]} ${error.message}; this says nothing about the bottle.`,
      },
      candidates: [],
    };
  }
}

/** One from each list in turn, so neither Source buries the other when no Kind was given. */
function interleave(lists: Candidate[][]): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; lists.some((list) => i < list.length); i++) {
    for (const list of lists) {
      const one = list[i];
      if (one) out.push(one);
    }
  }
  return out;
}

/** Each candidate with the Label of ours already holding its record, so it is not made twice. */
async function withOurLabels(candidates: Candidate[]): Promise<CatalogueCandidate[]> {
  if (candidates.length === 0) return [];
  const held = await query<{ source: SourceName; idAtSource: string; labelId: string }>(
    `select source, id_at_source as "idAtSource", label_id as "labelId"
       from label_sources
      where (source, id_at_source) in (select * from unnest($1::text[], $2::text[]))`,
    [candidates.map((one) => one.source), candidates.map((one) => one.idAtSource)]
  );
  return candidates.map((one) => ({
    ...one,
    label:
      held.find((row) => row.source === one.source && row.idAtSource === one.idAtSource)?.labelId ??
      null,
  }));
}

/** Our Labels holding a Source's record — for a barcode, the Label it was scanned for before. */
async function labelsHolding(source: SourceName, idAtSource: string): Promise<FoundLabel[]> {
  return query<FoundLabel>(
    `select l.id, l.producer, l.name, json_build_object('id', k.id, 'name', k.name) as kind,
            l.region, l.appellation, l.unverified, l.created_at as "createdAt",
            1 as matched, 1 as "ofWords"
       from label_sources s
       join labels l on l.id = s.label_id
       join kinds k on k.id = l.kind_id
      where s.source = $1 and s.id_at_source = $2`,
    [source, idAtSource]
  );
}
