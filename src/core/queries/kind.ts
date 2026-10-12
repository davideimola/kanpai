import "server-only";

import { asc } from "drizzle-orm";

import { kinds } from "../../../db/schema.ts";
import { db } from "../db.ts";

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

/** Every Kind, in the order they are offered in: the wines, then the spirits. */
export async function listKinds(): Promise<Kind[]> {
  return db()
    .select({
      id: kinds.id,
      name: kinds.name,
      section: kinds.section,
      hasVintages: kinds.hasVintages,
    })
    .from(kinds)
    .orderBy(asc(kinds.sortOrder));
}
