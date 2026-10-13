import "server-only";

import { query } from "../db.ts";
import { Refusal } from "../refusal.ts";
import {
  type Candidate,
  SOURCE_TITLE,
  type Sources,
  SourceUnavailable,
} from "../sources/candidate.ts";
import { createLabel, type NewLabel } from "./label.ts";
import { recordSource, type SourceName } from "./source.ts";

// A Label made from a candidate the owner or the assistant chose (ADR-0004, ADR-0011) — or an
// existing Label given one, for the Labels imported or written by hand with no Source.
//
// Named after the act, beside `queries/catalogue.ts`, because it crosses areas: it asks a
// Source and then writes a Label and its Source together.
//
// **The Source is re-read by its id**, never trusted from what the caller passed back: an
// assistant relaying a candidate can drop a field, mistype one or carry one over from the
// candidate beside it, and what is stored as *from Vivino* should be what Vivino says. Vivino
// re-reads by `filters=id=`, Open Food Facts by the barcode.
//
// **It is born checked** (`unverified: false`, ADR-0004 as amended on 2026-10-12), whichever door
// calls it: the Source's identifying facts are already right, and the to-check list is for what an
// assistant read off a photo or a conversation, not for a record someone chose.
//
// **What the caller says wins.** A fact passed alongside the choice is the owner's — read off
// the bottle, or said aloud — and a Source never overwrites what the owner said (`CONTEXT.md`,
// **Source**). The Source fills only what was left out.

/** Which record of which Source was chosen. */
export type Chosen = { source: SourceName; idAtSource: string };

/**
 * Re-read `chosen` from its Source and create the Label from it, with its first Vintage and
 * the Source recorded — image and page included — in one transaction. The Label is born
 * checked, never unverified.
 *
 * `facts` are the caller's and win over the Source's; `facts.kindId` is required, because the
 * Kind a Source suggests is a hint (Vivino types some spirits as red wine).
 */
export async function createLabelFromSource(
  sources: Sources,
  chosen: Chosen,
  facts: Omit<NewLabel, "name" | "source" | "unverified"> & { name?: string }
): Promise<{ labelId: string; vintageId: string }> {
  const candidate = await reread(sources, chosen, {
    off: "so a Label cannot be made from one of its records. Create it from what the owner said instead",
    otherwise: "or create the Label from what the owner said",
  });

  return createLabel({
    ...facts,
    name: facts.name ?? candidate.name,
    producer: facts.producer ?? candidate.producer,
    country: facts.country ?? candidate.country,
    region: facts.region ?? candidate.region,
    appellation: facts.appellation ?? candidate.appellation,
    grapes: facts.grapes ?? (candidate.grapes.length > 0 ? candidate.grapes : undefined),
    strength: facts.strength ?? candidate.strength,
    unverified: false,
    source: {
      source: candidate.source,
      idAtSource: candidate.idAtSource,
      imageUrl: candidate.imageUrl,
      pageUrl: candidate.pageUrl,
    },
  });
}

/** What linking a Label to a Source did. */
export type Linked = {
  /** The Source record's id on our side, `src_…`. */
  sourceId: string;
  source: SourceName;
  imageUrl: string | null;
  pageUrl: string;
  /** `true` when the Label already had this record, and nothing changed. */
  already: boolean;
};

/**
 * Give an existing Label the Source record the owner (or the assistant, once the owner said
 * yes) chose for it: its photo, its page and its credit — for a Label imported or written by
 * hand, which was made with no Source.
 *
 * The record is re-read from its Source by its id, as `createLabelFromSource` re-reads it, and
 * recorded by `recordSource` in the same shape, looked up now. **Nothing the Label says
 * changes**: its name, producer, Kind and the rest are the owner's, and a Source never
 * overwrites them (`CONTEXT.md`, **Source**). Nor does whether it is checked: a link adds a photo
 * and a page, it does not vouch for the facts an assistant wrote (ADR-0004).
 *
 * A record already on another Label is refused, naming that Label — it is the same bottle,
 * and the two want merging. The same record on this Label again changes nothing. A second
 * record, from the other Source or the same one, is taken: a Label has zero or more Sources.
 */
export async function linkLabelToSource(
  sources: Sources,
  labelId: string,
  chosen: Chosen
): Promise<Linked> {
  // The Label first, so a wrong id never costs a call to a Source.
  const found = await query("select 1 from labels where id = $1", [labelId]);
  if (found.length === 0) throw new Refusal("not-found", "No Label has that id.");

  const candidate = await reread(sources, chosen, {
    off: "so a Label cannot be linked to one of its records",
    otherwise: "or leave the Label as it is",
  });

  const before = await query(
    "select 1 from label_sources where label_id = $1 and source = $2 and id_at_source = $3",
    [labelId, candidate.source, candidate.idAtSource]
  );
  const sourceId = await recordSource(labelId, {
    source: candidate.source,
    idAtSource: candidate.idAtSource,
    imageUrl: candidate.imageUrl,
    pageUrl: candidate.pageUrl,
  });
  return {
    sourceId,
    source: candidate.source,
    imageUrl: candidate.imageUrl,
    pageUrl: candidate.pageUrl,
    already: before.length > 0,
  };
}

/**
 * The chosen record, read again from its Source by its id. Refused when the Source is off on
 * this copy, did not answer, or has no such record; `say` finishes the sentences for the act.
 */
async function reread(
  sources: Sources,
  chosen: Chosen,
  say: { off: string; otherwise: string }
): Promise<Candidate> {
  const title = SOURCE_TITLE[chosen.source];
  const source = sources[chosen.source];
  if (!source) {
    throw new Refusal("not-allowed", `${title} is not enabled on this copy, ${say.off}.`);
  }

  let candidate: Candidate | null;
  try {
    candidate = await source.byId(chosen.idAtSource);
  } catch (error) {
    if (!(error instanceof SourceUnavailable)) throw error;
    throw new Refusal(
      "unavailable",
      `${title} ${error.message}, so the record could not be re-read. Try again in a moment, ${say.otherwise}.`
    );
  }
  if (!candidate) {
    throw new Refusal("not-found", `${title} has no record with that id.`);
  }
  return candidate;
}
