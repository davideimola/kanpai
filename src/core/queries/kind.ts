import "server-only";

import { asc } from "drizzle-orm";

import { kinds } from "../../../db/schema.ts";
import { db } from "../db.ts";

/**
 * A Kind: what a Label is — Red, Sparkling, Whisky (`CONTEXT.md`).
 *
 * There is no union of the Kinds' names here on purpose. Kind is a data row, never an enum
 * in code (ADR-0002) — a beer is an insert, and a type that enumerated the eleven would
 * quietly make it a deployment instead. `family` *is* a union, because the model turns on
 * it and a third one would be a decision rather than a row.
 */
export type Kind = {
  id: string;
  name: string;
  family: Family;
};

/** Wine or spirit: the one split the model itself depends on (ADR-0002, ADR-0010). */
export type Family = "wine" | "spirit";

/** Every Kind, in the order they are offered in: the wines, then the spirits. */
export async function listKinds(): Promise<Kind[]> {
  const rows = await db()
    .select({ id: kinds.id, name: kinds.name, family: kinds.family })
    .from(kinds)
    .orderBy(asc(kinds.sortOrder));

  // The column is plain text with a check constraint, so Drizzle types it as `string`. The
  // constraint is what makes this narrowing true rather than hopeful.
  return rows.map((row) => ({ ...row, family: row.family as Family }));
}
