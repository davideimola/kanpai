import "server-only";

import { query } from "../db.ts";
import { SILHOUETTE, type Silhouette } from "./label.ts";
import {
  everyWordIn,
  LABEL_WORDS,
  listTastings,
  TASTING_WORDS,
  type TastingEntry,
} from "./tasting.ts";

// WHAT HAS BEEN DRUNK, LABEL BY LABEL: the diary's second view, *By wine* (spec §4). A question
// that crosses the Tastings and the Bottles, so it is named after the question rather than put
// in either (`src/core/README.md`).

/** One Label the owner has drunk, once, with what its Tastings and its finished Bottles say. */
export type DrunkLabel = {
  id: string;
  producer: string | null;
  name: string;
  kind: { id: string; name: string; section: string };
  region: string | null;
  appellation: string | null;
  silhouette: Silhouette;
  /** How many Tastings it has, over every Vintage. */
  tasted: number;
  /** The day of the latest Tasting, `2026-10-10`; `null` when it has none. */
  lastTastedOn: string | null;
  /**
   * The Rating of the latest rated Tasting — `Score.latest`, the same derivation (ADR-0003) —
   * or `null` when none is rated.
   */
  lastRating: number | null;
  /** How many of its Bottles are finished. */
  finished: number;
  /** The day the latest of them was finished; `null` when none is. */
  lastFinishedOn: string | null;
};

/** What *By wine* shows: the Labels, then the Tastings that kept none (ADR-0005). */
export type Drunk = { labels: DrunkLabel[]; loose: TastingEntry[] };

export type DrunkFilter = {
  /** A Kind's section, as its row names it. Loose Tastings have none, so it leaves them out. */
  section?: string;
  /** What the owner typed into the diary's search, read as `listTastings` reads it. */
  text?: string;
  /**
   * `last`, the default: the most recently drunk first. `rating`: the highest last Rating
   * first, the unrated after, each most recently drunk first.
   */
  sort?: "last" | "rating";
};

/**
 * Every Label the owner has drunk, each once: those with a Tasting, **and those with a
 * finished Bottle and no Tasting** — a bottle drunk with nothing recorded would otherwise
 * vanish from every page, since the Cellar no longer holds it and the diary never had it.
 *
 * *When it was drunk* is the latest Tasting's day, else the day its latest Bottle was finished.
 *
 * The search reads a Label's own words and every one of its Tastings' (`LABEL_WORDS`,
 * `TASTING_WORDS`), so a Label is found by a dinner it was drunk at; what is found is the
 * Label, and its counts and its last Rating are over all of its Tastings, not the ones that
 * matched.
 *
 * Loose Tastings are not a Label and are not counted in one (ADR-0005): they come back apart,
 * one by one, filtered and sorted the same way.
 */
export async function listDrunk(filter: DrunkFilter = {}): Promise<Drunk> {
  const section = filter.section?.trim() || null;
  const text = filter.text?.trim() || null;
  const byRating = filter.sort === "rating";

  const labels = await query<DrunkLabel>(
    `with tasted as (
       select v.label_id,
              count(*)::int as tasted,
              max(t.tasted_on) as last_tasted_on,
              (array_agg(t.rating order by t.tasted_on desc, t.created_at desc)
                 filter (where t.rating is not null))[1] as last_rating,
              string_agg(${TASTING_WORDS}, ' ') as words
         from tastings t
         join vintages v on v.id = t.vintage_id
        group by v.label_id
     ),
     finished as (
       select v.label_id,
              count(*)::int as finished,
              max(b.finished_at)::date as last_finished_on
         from bottles b
         join vintages v on v.id = b.vintage_id
        where b.state = 'finished'
        group by v.label_id
     )
     select l.id, l.producer, l.name,
            json_build_object('id', k.id, 'name', k.name, 'section', k.section) as kind,
            l.region, l.appellation, ${SILHOUETTE} as silhouette,
            coalesce(tasted.tasted, 0) as tasted,
            tasted.last_tasted_on::text as "lastTastedOn",
            tasted.last_rating::float8 as "lastRating",
            coalesce(finished.finished, 0) as finished,
            finished.last_finished_on::text as "lastFinishedOn"
       from labels l
       join kinds k on k.id = l.kind_id
       left join tasted on tasted.label_id = l.id
       left join finished on finished.label_id = l.id
      where (tasted.label_id is not null or finished.label_id is not null)
        and ($1::text is null or k.section = $1)
        and ${everyWordIn(`concat_ws(' ', ${LABEL_WORDS}, tasted.words)`, "$2::text")}
      order by case when $3 then tasted.last_rating end desc nulls last,
               coalesce(tasted.last_tasted_on, finished.last_finished_on) desc,
               lower(unaccent(l.name)), l.id`,
    [section, text, byRating]
  );

  const loose = section
    ? []
    : (await listTastings({ text: text ?? undefined })).filter((entry) => entry.label === null);
  if (byRating) loose.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

  return { labels, loose };
}
