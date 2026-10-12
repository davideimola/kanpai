import "server-only";

import { query } from "../db.ts";
import { Refusal } from "../refusal.ts";
import { isADay } from "../typed.ts";
import { type LabelTasting, SILHOUETTE, type Silhouette } from "./label.ts";

/** A Tasting as the diary and `read_tastings` show it: the occasion, and what was drunk. */
export type TastingEntry = LabelTasting & {
  /** What was known of a loose Tasting; `null` for one on a Vintage (ADR-0005). */
  description: string | null;
  vintage: { id: string; dating: "year" | "nv" | "unknown"; year: number | null } | null;
  label: {
    id: string;
    producer: string | null;
    name: string;
    kind: { id: string; name: string; section: string };
    region: string | null;
    appellation: string | null;
    /** How it is drawn beside the Tasting (ADR-0012). */
    silhouette: Silhouette;
  } | null;
};

/** What `read_tastings` filters by. Every one is optional, and they combine. */
export type TastingFilter = {
  kindId?: string;
  /** A Kind's section, as its row names it: `Wine`, `Spirits`. Loose Tastings have none. */
  section?: string;
  /** A region or an appellation, accents and case folded: `chianti` finds *Chianti Classico*. */
  region?: string;
  /** A grape, accents and case folded: `sangiovese`. */
  grape?: string;
  /** Only Tastings rated at least this; unrated ones are left out. */
  minRating?: number;
  /** The first day, `2026-01-01`, included. */
  from?: string;
  /** The last day, included. */
  to?: string;
  /**
   * What the owner typed into the diary's search: every word of it must start a word of the
   * Tasting or of what was drunk (`everyWordIn`). Accents and case folded.
   */
  text?: string;
};

/**
 * A condition that holds when **every word typed** — the parameter `typed`, folded and split as
 * `searchLabels` splits it — starts a word of `haystack`, folded too. Both are SQL written
 * here, never a caller's value; what was typed reaches it as a parameter, and a word holds
 * only letters and digits by then, so it is safe inside the pattern.
 *
 * Every word rather than any, because the diary's search narrows: *barolo 2019* is the Barolo,
 * not every Barolo and every 2019. The start of a word rather than anywhere in it, so *gin*
 * finds a gin and not an *original*. Nothing typed, or nothing but punctuation, holds for all.
 */
export function everyWordIn(haystack: string, typed: string): string {
  return `not exists (
            select 1 from regexp_split_to_table(lower(unaccent(${typed})), '[^a-z0-9]+') as word
             where word <> ''
               and lower(unaccent(${haystack})) !~ ('(^|[^a-z0-9])' || word))`;
}

/**
 * What a Tasting is found by, of the Tasting aliased `t`: the occasion and the owner's words —
 * the food, the place, the company, the notes and the guided answers — and a loose one's
 * description (ADR-0005). What was drunk is `LABEL_WORDS`.
 */
export const TASTING_WORDS = `concat_ws(' ', t.description, t.food, t.place, t.company, t.notes,
                                 t.liked_it, t.body_and_feel, t.reminded_of)`;

/**
 * What a Label is found by, of the Label aliased `l` and its Kind `k`: its name, producer,
 * appellation, region, country, grapes, and its Kind's name — *Red*, *Gin*.
 */
export const LABEL_WORDS = `concat_ws(' ', l.name, l.producer, l.appellation, l.region, l.country,
                                 array_to_string(l.grapes, ' '), k.name)`;

/**
 * The Tastings, newest first, filtered (spec §3, `read_tastings`).
 *
 * Loose Tastings (ADR-0005) are read alongside the others. They have no Kind, so a Kind
 * or a section filter leaves them out; a region or a grape filter also looks in their description,
 * because *a Primitivo by the glass* is a Primitivo whether or not a Label says so. A text
 * filter reads both: what was drunk, and what was said of it.
 */
export async function listTastings(filter: TastingFilter = {}): Promise<TastingEntry[]> {
  for (const day of [filter.from, filter.to]) {
    if (day !== undefined && !isADay(day))
      throw new Refusal("invalid", "A day is written 2026-10-12.");
  }
  return query<TastingEntry>(
    `select t.id, t.tasted_on::text as "tastedOn", t.place, t.food, t.company,
            t.rating::float8 as rating, t.notes, t.liked_it as "likedIt",
            t.body_and_feel as "bodyAndFeel", t.reminded_of as "remindedOf", t.description,
            case when v.id is null then null
                 else json_build_object('id', v.id, 'dating', v.dating, 'year', v.year) end as vintage,
            case when l.id is null then null
                 else json_build_object('id', l.id, 'producer', l.producer, 'name', l.name,
                        'kind', json_build_object('id', k.id, 'name', k.name, 'section', k.section),
                        'region', l.region, 'appellation', l.appellation,
                        'silhouette', ${SILHOUETTE}) end as label
       from tastings t
       left join vintages v on v.id = t.vintage_id
       left join labels l on l.id = v.label_id
       left join kinds k on k.id = l.kind_id
      where ($1::text is null or l.kind_id = $1)
        and ($2::text is null or strpos(
              lower(unaccent(concat_ws(' ', l.region, l.appellation, t.description))),
              lower(unaccent($2))) > 0)
        and ($3::text is null
             or exists (select 1 from unnest(l.grapes) g
                         where strpos(lower(unaccent(g)), lower(unaccent($3))) > 0)
             or strpos(lower(unaccent(coalesce(t.description, ''))), lower(unaccent($3))) > 0)
        and ($4::numeric is null or t.rating >= $4)
        and ($5::date is null or t.tasted_on >= $5)
        and ($6::date is null or t.tasted_on <= $6)
        and ($7::text is null or k.section = $7)
        and ${everyWordIn(`concat_ws(' ', ${LABEL_WORDS}, ${TASTING_WORDS})`, "$8::text")}
      order by t.tasted_on desc, t.created_at desc, t.id`,
    [
      filter.kindId ?? null,
      blankless(filter.region),
      blankless(filter.grape),
      filter.minRating ?? null,
      filter.from ?? null,
      filter.to ?? null,
      blankless(filter.section),
      blankless(filter.text),
    ]
  );
}

function blankless(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
