import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, unique } from "drizzle-orm/pg-core";

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
 * migration of the type system. So the two things the rest of the app asks of a Kind are
 * columns on the row rather than a closed list of families: `section`, the heading it is
 * listed under, and `has_vintages`, the one fact the model turns on — a Label of a Kind
 * without vintages has exactly one Vintage, NV (ADR-0002, ADR-0010). A beer is
 * `('Beer', 'Beer', false)` and nothing else changes.
 */
export const kinds = pgTable(
  "kinds",
  {
    // Prefixed text, as in the siblings: `kind_red`, or `kind_<24 hex>` for a row added
    // without one. The function is hand-written in the first migration.
    id: text().primaryKey().default(sql`gen_prefixed_id('kind')`),
    name: text().notNull(),
    section: text().notNull(),
    hasVintages: boolean().notNull(),
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
    check(
      "kinds_section_is_not_blank",
      sql`${table.section} = btrim(${table.section}) and ${table.section} <> ''`
    ),
    check("kinds_sort_order_is_positive", sql`${table.sortOrder} > 0`),
  ]
);
