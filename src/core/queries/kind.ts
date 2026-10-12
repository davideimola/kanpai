import "server-only";

import { asc, eq } from "drizzle-orm";

import { kinds } from "../../../db/schema.ts";
import { db, query } from "../db.ts";
import type { BottleShape, Liquid } from "../verbs/kind.ts";

/**
 * A Kind: what a Label is — Red, Sparkling, Whisky (`CONTEXT.md`).
 *
 * There is no union of anything here on purpose. Kind is a data row, never an enum in code
 * (ADR-0002) — a beer is an insert, and a type that enumerated the eleven, or their
 * sections, would quietly make it a deployment instead.
 */
export type Kind = {
  id: string;
  name: string;
  /** The heading it is listed under — Wine, Spirits — as the row says it. */
  section: string;
  /** Whether a Label of this Kind has years; without, its one Vintage is NV (ADR-0010). */
  hasVintages: boolean;
};

/**
 * Every Kind a Label can be created as, in the order they are offered in: the wines, then the
 * spirits. A hidden Kind is left out — this is the list a form and an assistant pick from
 * (`list_kinds`), and hiding is how the owner retires one (ADR-0012).
 */
export async function listKinds(): Promise<Kind[]> {
  return db()
    .select({
      id: kinds.id,
      name: kinds.name,
      section: kinds.section,
      hasVintages: kinds.hasVintages,
    })
    .from(kinds)
    .where(eq(kinds.hidden, false))
    .orderBy(asc(kinds.sortOrder));
}

/** A Kind as `/settings` keeps it: everything about the row, and how many Labels are of it. */
export type KeptKind = Kind & {
  bottleShape: BottleShape;
  liquid: Liquid;
  hidden: boolean;
  sortOrder: number;
  /** A Kind with Labels is never deleted, only hidden. */
  labels: number;
};

/** Every Kind, hidden ones included, in their order — what the owner rearranges. */
export async function listEveryKind(): Promise<KeptKind[]> {
  return query<KeptKind>(
    `select k.id, k.name, k.section, k.has_vintages as "hasVintages",
            k.bottle_shape as "bottleShape", k.liquid, k.hidden, k.sort_order as "sortOrder",
            (select count(*) from labels l where l.kind_id = k.id)::int as labels
       from kinds k
      order by k.sort_order`
  );
}
