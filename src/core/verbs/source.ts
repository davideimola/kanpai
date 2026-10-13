import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { SOURCE_TITLE } from "../sources/candidate.ts";
import type { Executor } from "../transaction.ts";
import { said } from "../typed.ts";

/** The catalogues a Label may be found in (ADR-0011). Which is asked first is the Kind's. */
export type SourceName = "openfoodfacts" | "vivino";

/** What a Source said about a Label: its own id for it, and where its image and page are. */
export type SourceRecord = {
  source: SourceName;
  /** The Source's id: an Open Food Facts barcode, a Vivino wine id. */
  idAtSource: string;
  /** Hotlinked: the address is kept, the bytes never are (ADR-0011). */
  imageUrl?: string | null;
  pageUrl?: string | null;
  /** When the Source was asked. Now, unless the record is older than the call. */
  lookedUpAt?: Date;
};

/**
 * Record that a Label was found in a Source (`CONTEXT.md`, **Source**).
 *
 * One record in a Source names one Label of ours: the same Vivino wine on a second Label is
 * refused as `already-exists`, naming the Label that holds it, because it means the two are one
 * and want merging. The same record on the same Label again is not an error and changes
 * nothing: it is already there, and its id is returned.
 *
 * `createLabel` composes it, to record the Source a Label was created from in the same
 * transaction — hence `run`, where to run, last.
 */
export async function recordSource(
  labelId: string,
  record: SourceRecord,
  run: Executor = query
): Promise<string> {
  // Asked first so the refusal can say which Label holds it: once the insert has failed, a
  // transaction can ask nothing more. The unique constraint still holds the rule.
  const [held] = await run<{ id: string; labelId: string; name: string; producer: string | null }>(
    `select s.id, s.label_id as "labelId", l.name, l.producer
       from label_sources s join labels l on l.id = s.label_id
      where s.source = $1 and s.id_at_source = $2`,
    [record.source, record.idAtSource.trim()]
  );
  if (held?.labelId === labelId) return held.id;
  if (held) {
    const which = [held.name, held.producer].filter(Boolean).join(", ");
    throw new Refusal(
      "already-exists",
      `That ${SOURCE_TITLE[record.source] ?? "Source"} record is already on another Label, ${which} (${held.labelId}). If it is the same bottle, use that Label, or merge the two.`,
      { constraint: "label_sources_one_label_per_record" }
    );
  }

  const [row] = await refusing(
    () =>
      run<{ id: string }>(
        `insert into label_sources (label_id, source, id_at_source, image_url, page_url, looked_up_at)
         values ($1, $2, $3, $4, $5, coalesce($6, now()))
         returning id`,
        [
          labelId,
          record.source,
          record.idAtSource.trim(),
          said(record.imageUrl) ?? null,
          said(record.pageUrl) ?? null,
          record.lookedUpAt ?? null,
        ]
      ),
    (constraint) => {
      switch (constraint) {
        case "label_sources_label_exists":
          return "No Label has that id.";
        case "label_sources_one_label_per_record":
          return "That Source record already belongs to a Label: search the catalogue for it and use that Label. If it is this one, merge the two.";
        case "label_sources_source_is_known":
          return "A Source is Open Food Facts or Vivino.";
        case "label_sources_image_url_is_a_web_address":
        case "label_sources_page_url_is_a_web_address":
          return "An image or a page is a web address, starting with http:// or https://.";
        default:
          return "That Source could not be recorded.";
      }
    }
  );
  if (!row) throw new Error("insert into label_sources returned no row");
  return row.id;
}
