import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { transaction } from "../transaction.ts";
import { changing } from "../typed.ts";

// The Kinds, written by the owner from `/settings` (spec §4). A Kind is a row and never an
// enum (ADR-0002), so adding one, renaming one or moving it to another section is a write
// like any other — and nothing in code learns its name.

/**
 * The silhouettes a bottle is drawn as (ADR-0012). A closed set the database also holds
 * (`kinds_bottle_shape_is_known`, `labels_bottle_shape_is_known`), like a Bottle's Level and
 * unlike the Kinds: each one is a drawing, and a shape nobody drew is refused rather than
 * drawn as nothing.
 */
export const BOTTLE_SHAPES = ["bordeaux", "burgundy", "flute", "spirit", "sake", "beer"] as const;
export type BottleShape = (typeof BOTTLE_SHAPES)[number];

/** The colours of what is in a bottle, as drawn (ADR-0012; `kinds_liquid_is_known`). */
export const LIQUIDS = ["red", "white", "rose", "orange", "amber", "clear"] as const;
export type Liquid = (typeof LIQUIDS)[number];

/** What the owner says about a Kind. `hasVintages` is said once, when it is added. */
export type KindFacts = {
  name: string;
  /** The heading it is listed under: Wine, Spirits, or one the owner names. */
  section: string;
  bottleShape: BottleShape;
  liquid: Liquid;
};

const COLUMNS: Record<keyof KindFacts, string> = {
  name: "name",
  section: "section",
  bottleShape: "bottle_shape",
  liquid: "liquid",
};

const NO_SUCH_KIND = "No Kind has that id.";

function kindRefusal(constraint: string | undefined): string {
  switch (constraint) {
    case "kinds_name_key":
      return "A Kind already has that name. Choose another, or show the hidden one.";
    case "kinds_name_is_not_blank":
      return "A Kind has a name.";
    case "kinds_section_is_not_blank":
      return "A Kind is listed under a section: Wine, Spirits, or one you name.";
    case "kinds_bottle_shape_is_known":
      return "A bottle is drawn as a Bordeaux, a Burgundy, a flute, a spirit bottle, a sake bottle or a beer.";
    case "kinds_liquid_is_known":
      return "What is in the bottle is red, white, rosé, orange, amber or clear.";
    default:
      return "That Kind could not be recorded.";
  }
}

function asStored(facts: Partial<KindFacts>): Partial<Record<keyof KindFacts, unknown>> {
  return {
    name: facts.name?.trim(),
    section: facts.section?.trim(),
    bottleShape: facts.bottleShape,
    liquid: facts.liquid,
  };
}

/**
 * Add a Kind, offered last: a beer, a kombucha, whatever the copy's owner keeps (ADR-0002).
 *
 * Whether a Label of it has years is said here and nowhere else, because it decides what its
 * Vintages may be (ADR-0010) and changing it under existing Labels would leave them wrong.
 */
export async function addKind(kind: KindFacts & { hasVintages: boolean }): Promise<string> {
  const stored = asStored(kind);
  const [row] = await refusing(
    () =>
      query<{ id: string }>(
        `insert into kinds (name, section, has_vintages, bottle_shape, liquid, sort_order)
         values ($1, $2, $3, $4, $5, (select coalesce(max(sort_order), 0) + 1 from kinds))
         returning id`,
        [stored.name, stored.section, kind.hasVintages, stored.bottleShape, stored.liquid]
      ),
    kindRefusal
  );
  if (!row) throw new Error("insert into kinds returned no row");
  return row.id;
}

/**
 * Rename a Kind, move it to another section, or draw it differently. Fields left out are left
 * alone. Every Label of it follows, because they point at the row.
 */
export async function amendKind(kindId: string, changes: Partial<KindFacts>): Promise<void> {
  const { set, values } = changing(asStored(changes), COLUMNS, 2);
  const updated = await refusing(
    () =>
      set.length === 0
        ? query("select id from kinds where id = $1", [kindId])
        : query(`update kinds set ${set.join(", ")} where id = $1 returning id`, [
            kindId,
            ...values,
          ]),
    kindRefusal
  );
  if (updated.length === 0) throw new Refusal("not-found", NO_SUCH_KIND);
}

/**
 * Move a Kind one place earlier or later in the order every list offers them in. At either
 * end it stays where it is.
 *
 * Three writes, because `kinds_sort_order_key` is checked row by row: the Kind steps out of
 * the way, its neighbour takes its place, and it takes the neighbour's.
 */
export async function moveKind(kindId: string, direction: "earlier" | "later"): Promise<void> {
  await transaction(async (run) => {
    const [kind] = await run<{ sortOrder: number }>(
      `select sort_order as "sortOrder" from kinds where id = $1 for update`,
      [kindId]
    );
    if (!kind) throw new Refusal("not-found", NO_SUCH_KIND);

    const [neighbour] = await run<{ id: string; sortOrder: number }>(
      direction === "earlier"
        ? `select id, sort_order as "sortOrder" from kinds where sort_order < $1
            order by sort_order desc limit 1 for update`
        : `select id, sort_order as "sortOrder" from kinds where sort_order > $1
            order by sort_order limit 1 for update`,
      [kind.sortOrder]
    );
    if (!neighbour) return;

    await run(
      "update kinds set sort_order = (select max(sort_order) + 1 from kinds) where id = $1",
      [kindId]
    );
    await run("update kinds set sort_order = $2 where id = $1", [neighbour.id, kind.sortOrder]);
    await run("update kinds set sort_order = $2 where id = $1", [kindId, neighbour.sortOrder]);
  });
}

/**
 * Hide a Kind from every list a form or an assistant picks from, or show it again. Its Labels
 * keep it: hiding is how a Kind in use is retired, since it is never deleted.
 */
export async function setKindHidden(kindId: string, hidden: boolean): Promise<void> {
  const updated = await query("update kinds set hidden = $2 where id = $1 returning id", [
    kindId,
    hidden,
  ]);
  if (updated.length === 0) throw new Refusal("not-found", NO_SUCH_KIND);
}

/**
 * Delete a Kind nothing is of. **A Kind with Labels is never deleted** — it is hidden instead
 * — and the refusal says so; the foreign key would refuse it anyway.
 */
export async function deleteKind(kindId: string): Promise<void> {
  const deleted = await refusing(
    () =>
      query(
        `delete from kinds k
          where k.id = $1 and not exists (select 1 from labels where kind_id = k.id)
          returning id`,
        [kindId]
      ),
    () => "A Kind with Labels is kept. Hide it instead."
  );
  if (deleted.length > 0) return;

  const found = await query("select 1 from kinds where id = $1", [kindId]);
  throw found.length === 0
    ? new Refusal("not-found", NO_SUCH_KIND)
    : new Refusal("not-allowed", "A Kind with Labels is kept. Hide it instead.");
}
