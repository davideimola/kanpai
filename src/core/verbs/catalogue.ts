import "server-only";

import { Refusal } from "../refusal.ts";
import { SOURCE_TITLE, type Sources, SourceUnavailable } from "../sources/candidate.ts";
import { createLabel, type NewLabel } from "./label.ts";
import type { SourceName } from "./source.ts";

// A Label made from a candidate the owner or the assistant chose (ADR-0004, ADR-0011).
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
  const title = SOURCE_TITLE[chosen.source];
  const source = sources[chosen.source];
  if (!source) {
    throw new Refusal(
      "not-allowed",
      `${title} is not enabled on this copy, so a Label cannot be made from one of its records. Create it from what the owner said instead.`
    );
  }

  let candidate: Awaited<ReturnType<typeof source.byId>>;
  try {
    candidate = await source.byId(chosen.idAtSource);
  } catch (error) {
    if (!(error instanceof SourceUnavailable)) throw error;
    throw new Refusal(
      "unavailable",
      `${title} ${error.message}, so the record could not be re-read. Try again in a moment, or create the Label from what the owner said.`
    );
  }
  if (!candidate) {
    throw new Refusal("not-found", `${title} has no record with that id.`);
  }

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
