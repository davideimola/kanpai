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
