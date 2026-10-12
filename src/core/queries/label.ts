import "server-only";

import { query } from "../db.ts";
import type { Level } from "../verbs/bottle.ts";
import type { SourceName } from "../verbs/source.ts";

/** A Kind as a Label carries it. */
export type KindOfLabel = { id: string; name: string; section: string; hasVintages: boolean };

/**
 * What the Tastings of a Label or a Vintage say, derived and never stored (ADR-0003).
 *
 * Both numbers, because a wine that delighted at dinner and disappointed three years later is
 * information for the sommelier, not noise. Only rated Tastings count; `rated` says how many,
 * so an average of one is read as what it is.
 */
export type Score = {
  /** The Rating of the most recent rated Tasting, or `null` when none is rated. */
  latest: number | null;
  /** The mean of every Rating, to two places, or `null` when none is rated. */
  average: number | null;
  rated: number;
};

export type LabelBottle = {
  id: string;
  state: "closed" | "open" | "finished";
  level: Level | null;
  boughtOn: string | null;
  price: string | null;
  boughtWhere: string | null;
  openedAt: Date | null;
  finishedAt: Date | null;
};

export type LabelTasting = {
  id: string;
  tastedOn: string;
  place: string | null;
  food: string | null;
  company: string | null;
  rating: number | null;
  notes: string | null;
  likedIt: string | null;
  bodyAndFeel: string | null;
  remindedOf: string | null;
};

export type LabelVintage = {
  id: string;
  dating: "year" | "nv" | "unknown";
  year: number | null;
  score: Score;
  bottles: LabelBottle[];
  /** Newest first. */
  tastings: LabelTasting[];
};

export type LabelSource = {
  id: string;
  source: SourceName;
  idAtSource: string;
  imageUrl: string | null;
  pageUrl: string | null;
  lookedUpAt: Date;
};

/** One Label, whole: what `/labels/<id>` shows and what `get_label` returns. */
export type LabelPage = {
  id: string;
  producer: string | null;
  name: string;
  kind: KindOfLabel;
  country: string | null;
  region: string | null;
  appellation: string | null;
  grapes: string[];
  ageStatement: string | null;
  strength: number | null;
  unverified: boolean;
  ownImageUrl: string | null;
  createdAt: Date;
  /** Over every Vintage, the unknown one counted like any other (ADR-0010). */
  score: Score;
  /** The years newest first, then NV, then unknown. */
  vintages: LabelVintage[];
  sources: LabelSource[];
};

// A score over the Tastings `where` selects, as two columns and a count. Written once so the
// Label's and each Vintage's are the same derivation; `where` is one of the two literals
// below, never a caller's value.
function scoreOver(where: string): string {
  return `(select t.rating::float8 from tastings t where ${where} and t.rating is not null
            order by t.tasted_on desc, t.created_at desc limit 1) as latest,
          (select round(avg(t.rating), 2)::float8 from tastings t where ${where}) as average,
          (select count(t.rating)::int from tastings t where ${where}) as rated`;
}

type ScoreRow = { latest: number | null; average: number | null; rated: number };

function score(row: ScoreRow): Score {
  return { latest: row.latest, average: row.average, rated: row.rated };
}

/**
 * One Label with its Vintages, their Bottles and Tastings, its Sources, and the scores
 * derived from the Tastings — the Label's and each Vintage's (ADR-0003, ADR-0010). `null`
 * when no Label has that id.
 */
export async function getLabel(labelId: string): Promise<LabelPage | null> {
  const [label] = await query<
    Omit<LabelPage, "kind" | "score" | "vintages" | "sources"> &
      ScoreRow & {
        kindId: string;
        kindName: string;
        kindSection: string;
        kindHasVintages: boolean;
      }
  >(
    `select l.id, l.producer, l.name, l.country, l.region, l.appellation, l.grapes,
            l.age_statement as "ageStatement", l.strength::float8 as strength, l.unverified,
            l.own_image_url as "ownImageUrl", l.created_at as "createdAt",
            k.id as "kindId", k.name as "kindName", k.section as "kindSection",
            k.has_vintages as "kindHasVintages",
            ${scoreOver("t.vintage_id in (select id from vintages where label_id = l.id)")}
       from labels l join kinds k on k.id = l.kind_id
      where l.id = $1`,
    [labelId]
  );
  if (!label) return null;

  const [vintages, bottles, tastings, sources] = await Promise.all([
    query<Omit<LabelVintage, "score" | "bottles" | "tastings"> & ScoreRow>(
      `select v.id, v.dating, v.year, ${scoreOver("t.vintage_id = v.id")}
         from vintages v
        where v.label_id = $1
        order by case v.dating when 'year' then 0 when 'nv' then 1 else 2 end, v.year desc`,
      [labelId]
    ),
    query<LabelBottle & { vintageId: string }>(
      `select b.id, b.vintage_id as "vintageId", b.state, b.level,
              b.bought_on::text as "boughtOn", b.price::text as price,
              b.bought_where as "boughtWhere", b.opened_at as "openedAt",
              b.finished_at as "finishedAt"
         from bottles b join vintages v on v.id = b.vintage_id
        where v.label_id = $1
        order by b.created_at, b.id`,
      [labelId]
    ),
    query<LabelTasting & { vintageId: string }>(
      `select t.id, t.vintage_id as "vintageId", t.tasted_on::text as "tastedOn", t.place,
              t.food, t.company, t.rating::float8 as rating, t.notes, t.liked_it as "likedIt",
              t.body_and_feel as "bodyAndFeel", t.reminded_of as "remindedOf"
         from tastings t join vintages v on v.id = t.vintage_id
        where v.label_id = $1
        order by t.tasted_on desc, t.created_at desc`,
      [labelId]
    ),
    query<LabelSource>(
      `select id, source, id_at_source as "idAtSource", image_url as "imageUrl",
              page_url as "pageUrl", looked_up_at as "lookedUpAt"
         from label_sources
        where label_id = $1
        order by case source when 'openfoodfacts' then 0 else 1 end, looked_up_at`,
      [labelId]
    ),
  ]);

  const { kindId, kindName, kindSection, kindHasVintages, latest, average, rated, ...rest } = label;
  return {
    ...rest,
    kind: { id: kindId, name: kindName, section: kindSection, hasVintages: kindHasVintages },
    score: score({ latest, average, rated }),
    vintages: vintages.map(({ latest, average, rated, ...vintage }) => ({
      ...vintage,
      score: score({ latest, average, rated }),
      bottles: bottles.filter((b) => b.vintageId === vintage.id).map(({ vintageId: _, ...b }) => b),
      tastings: tastings
        .filter((t) => t.vintageId === vintage.id)
        .map(({ vintageId: _, ...t }) => t),
    })),
    sources,
  };
}

/** A Label as a list shows it: enough to recognise it and open it. */
export type LabelInList = {
  id: string;
  producer: string | null;
  name: string;
  kind: { id: string; name: string };
  region: string | null;
  appellation: string | null;
  unverified: boolean;
  createdAt: Date;
};

const IN_LIST = `l.id, l.producer, l.name, json_build_object('id', k.id, 'name', k.name) as kind,
                 l.region, l.appellation, l.unverified, l.created_at as "createdAt"`;

/**
 * The Labels the assistant created and the owner has not looked at yet — the to-check page
 * (ADR-0004). Oldest first: the one waiting longest is the one to look at.
 */
export async function listUnverifiedLabels(): Promise<LabelInList[]> {
  return query<LabelInList>(
    `select ${IN_LIST}
       from labels l join kinds k on k.id = l.kind_id
      where l.unverified
      order by l.created_at, l.id`
  );
}

/** A Label found by a search, and how well it matched. */
export type FoundLabel = LabelInList & {
  /** How many of the words searched for this Label has. */
  matched: number;
  /** How many words the search had, once folded. */
  ofWords: number;
};

/**
 * Search our own Labels by what the owner or the assistant typed — the first half of
 * `search_catalogue`, which asks the Sources only after this (ADR-0004, ADR-0011).
 *
 * Three decisions, each from the catalogue as it is:
 *
 *   - **Accents and case are folded on both sides** (`unaccent`, `0008`), so `Rose` finds
 *     *Rosé* and `rosé` finds *Rose*.
 *   - **Word by word, not as one string.** Producers are written two ways — *Fattoria le
 *     Corti* and *Principe Corsini* are one estate (`docs/research/source-sample.md`) — so the
 *     search never needs the producer to match as typed. Each word typed is looked for at the
 *     start of a word of the producer or the name, and a Label is found when any word matches.
 *   - **Ranked by how many matched**, the name breaking ties before the producer, so *Corsini
 *     Rosé* puts the Sparkling Rosé first and still shows the estate's other Labels after it.
 *     Words of one letter are not searched for: an `l` from *L'Ornato* would match everything.
 *
 * What was typed reaches SQL as a parameter, and is split into words there.
 */
export async function searchLabels(term: string, limit = 20): Promise<FoundLabel[]> {
  return query<FoundLabel>(
    `with typed as (
       select distinct word
         from regexp_split_to_table(lower(unaccent($1)), '[^a-z0-9]+') as word
        where length(word) > 1
     ),
     scored as (
       select l.id,
              (select count(*) from typed
                where exists (select 1 from unnest(regexp_split_to_array(
                                lower(unaccent(coalesce(l.producer, '') || ' ' || l.name)),
                                '[^a-z0-9]+')) as w
                               where starts_with(w, typed.word)))::int as matched,
              (select count(*) from typed
                where exists (select 1 from unnest(regexp_split_to_array(
                                lower(unaccent(l.name)), '[^a-z0-9]+')) as w
                               where starts_with(w, typed.word)))::int as in_name
         from labels l
     )
     select ${IN_LIST}, s.matched, (select count(*) from typed)::int as "ofWords"
       from scored s
       join labels l on l.id = s.id
       join kinds k on k.id = l.kind_id
      where s.matched > 0
      order by s.matched desc, s.in_name desc, lower(unaccent(l.name)), l.id
      limit $2`,
    [term, limit]
  );
}
