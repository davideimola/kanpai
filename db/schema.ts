import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, unique } from "drizzle-orm/pg-core";

// The schema, described for Drizzle.
//
// `drizzle-kit generate` diffs this file against the last snapshot in `db/migrations/meta`
// and writes the next migration; `src/core/db.ts` attaches it to the connection so a plain
// query can be typed from it. It is **not** the whole schema: what Drizzle cannot say —
// `gen_prefixed_id()`, every `comment on`, the rows of a vocabulary — is hand-written SQL in
// the migrations, and those files are the authority where the two differ. See the README's
// *The schema*.

/**
 * What a Label is: a red, a sparkling, a whisky (`CONTEXT.md`, **Kind**).
 *
 * **A row, never an enum in code** (ADR-0002): a beer or a sake is an insert, not a
 * migration of the type system. What *is* closed is the `family` — wine or spirit — because
 * the model itself turns on it: a spirit Label has exactly one Vintage, NV (ADR-0002,
 * ADR-0010). A third family would be a decision about the model, not a new row.
 */
export const kinds = pgTable(
  "kinds",
  {
    // Prefixed text, as in the siblings: `kind_red`, or `kind_<24 hex>` for a row added
    // without one. The function is hand-written in the first migration.
    id: text().primaryKey().default(sql`gen_prefixed_id('kind')`),
    name: text().notNull(),
    family: text().notNull(),
    sortOrder: integer().notNull(),
  },
  (table) => [
    unique("kinds_name_key").on(table.name),
    unique("kinds_sort_order_key").on(table.sortOrder),
    check("kinds_id_is_prefixed", sql`${table.id} ~ '^kind_[a-z0-9]+(_[a-z0-9]+)*$'`),
    check(
      "kinds_name_is_not_blank",
      sql`${table.name} = btrim(${table.name}) and ${table.name} <> ''`
    ),
    check("kinds_family_is_wine_or_spirit", sql`${table.family} in ('wine', 'spirit')`),
    check("kinds_sort_order_is_positive", sql`${table.sortOrder} > 0`),
  ]
);
