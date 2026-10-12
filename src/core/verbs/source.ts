import "server-only";

import { query } from "../db.ts";
import { refusing } from "../refusal.ts";
import { said } from "../typed.ts";

/** The catalogues a Label may be found in, in the order they are asked (ADR-0006). */
export type SourceName = "openfoodfacts" | "vivino";

/** What a Source said about a Label: its own id for it, and where its image and page are. */
export type SourceRecord = {
  source: SourceName;
  /** The Source's id: an Open Food Facts barcode, a Vivino wine id. */
  idAtSource: string;
  /** Hotlinked: the address is kept, the bytes never are (ADR-0006). */
  imageUrl?: string | null;
  pageUrl?: string | null;
  /** When the Source was asked. Now, unless the record is older than the call. */
  lookedUpAt?: Date;
};

/**
 * Record that a Label was found in a Source (`CONTEXT.md`, **Source**).
 *
 * One record in a Source names one Label of ours: the same Vivino wine on a second Label is
 * refused as `already-exists`, because it means the two are one and want merging.
 */
export async function recordSource(labelId: string, record: SourceRecord): Promise<string> {
  const [row] = await refusing(
    () =>
      query<{ id: string }>(
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
          return "That Source record already belongs to a Label. If it is this one, merge the two.";
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
