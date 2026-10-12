import "server-only";

import { query } from "../db.ts";
import type { Level } from "../verbs/bottle.ts";
import { SILHOUETTE, type Silhouette } from "./label.ts";

/** One Bottle in the house, with what the sommelier needs to suggest it. */
export type CellarBottle = {
  id: string;
  state: "closed" | "open";
  /** How much is left, for an open one; `null` for a closed one (ADR-0007). */
  level: Level | null;
  openedAt: Date | null;
  boughtOn: string | null;
  vintage: { id: string; dating: "year" | "nv" | "unknown"; year: number | null };
  label: {
    id: string;
    producer: string | null;
    name: string;
    kind: { id: string; name: string };
    region: string | null;
    appellation: string | null;
    /** How it is drawn on the shelf (ADR-0012). */
    silhouette: Silhouette;
  };
};

/** One heading of the Cellar: a Kind's section — Wine, Spirits — and its Bottles. */
export type CellarSection = { section: string; bottles: CellarBottle[] };

/**
 * The Cellar: the Bottles that are closed or open — what can be drunk tonight
 * (`CONTEXT.md`, **Cellar**; ADR-0007). A view, not a table.
 *
 * Grouped under the Kind's `section`, in the order the Kinds are offered in, so a Kind added
 * later finds its heading without this file knowing its name (ADR-0002). Within a section,
 * by Kind, then Label, then year.
 */
export async function readCellar(): Promise<CellarSection[]> {
  const rows = await query<CellarBottle & { section: string }>(
    `select b.id, b.state, b.level, b.opened_at as "openedAt", b.bought_on::text as "boughtOn",
            json_build_object('id', v.id, 'dating', v.dating, 'year', v.year) as vintage,
            json_build_object('id', l.id, 'producer', l.producer, 'name', l.name,
              'kind', json_build_object('id', k.id, 'name', k.name),
              'region', l.region, 'appellation', l.appellation,
              'silhouette', ${SILHOUETTE}) as label,
            k.section
       from bottles b
       join vintages v on v.id = b.vintage_id
       join labels l on l.id = v.label_id
       join kinds k on k.id = l.kind_id
      where b.state <> 'finished'
      order by min(k.sort_order) over (partition by k.section), k.sort_order,
               lower(unaccent(l.name)), l.id, v.year desc nulls last, v.dating,
               b.created_at, b.id`
  );

  const sections: CellarSection[] = [];
  for (const { section, ...bottle } of rows) {
    const last = sections.at(-1);
    if (last?.section === section) last.bottles.push(bottle);
    else sections.push({ section, bottles: [bottle] });
  }
  return sections;
}

/** What of one Vintage of a Label is in the Cellar: how many Bottles, and how many open. */
export type HeldVintage = {
  dating: "year" | "nv" | "unknown";
  year: number | null;
  /** Closed and open together. */
  bottles: number;
  open: number;
};

/**
 * What the Cellar holds of each of these Labels, Vintage by Vintage — the line `/add` writes
 * under a Label the owner already has (*Two bottles of 2019*), so a bottle bought twice is seen
 * to be in the house before it is added again.
 *
 * Every Label asked about has an entry, empty when none of its Bottles is in the house. The
 * Vintages are the years newest first, then NV, then unknown, as the Label page orders them.
 */
export async function heldInTheCellar(
  labelIds: readonly string[]
): Promise<Map<string, HeldVintage[]>> {
  const held = new Map<string, HeldVintage[]>(labelIds.map((id) => [id, []]));
  if (labelIds.length === 0) return held;

  const rows = await query<HeldVintage & { labelId: string }>(
    `select v.label_id as "labelId", v.dating, v.year,
            count(*)::int as bottles,
            (count(*) filter (where b.state = 'open'))::int as open
       from bottles b
       join vintages v on v.id = b.vintage_id
      where v.label_id = any($1::text[]) and b.state <> 'finished'
      group by v.label_id, v.id, v.dating, v.year
      order by v.label_id, v.year desc nulls last, v.dating = 'unknown', v.id`,
    [labelIds]
  );
  for (const { labelId, ...vintage } of rows) held.get(labelId)?.push(vintage);
  return held;
}
