import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

// ── Helpers for the checks every table repeats ─────────────────────────────────────────────

/** A prefixed id, as `gen_prefixed_id()` mints it — or a readable slug a fixture wrote. */
function prefixed(column: AnyPgColumn, prefix: string) {
  return sql`${column} ~ ${sql.raw(`'^${prefix}_[a-z0-9]+(_[a-z0-9]+)*$'`)}`;
}

/** Optional text that is either absent or says something: never `''`, never padding. */
function absentOrSaid(column: AnyPgColumn) {
  return sql`${column} is null or (${column} = btrim(${column}) and ${column} <> '')`;
}

/** Optional prose — notes, a description — which may span lines but is never only blanks. */
function absentOrWritten(column: AnyPgColumn) {
  return sql`${column} is null or btrim(${column}) <> ''`;
}

/** An address an image or a page is fetched from by the owner's browser, never by us. */
function absentOrWebAddress(column: AnyPgColumn) {
  return sql`${column} is null or ${column} ~ '^https?://[^[:space:]]+$'`;
}

/**
 * One thing a producer bottles and sells under one name, independent of the year
 * (`CONTEXT.md`, **Label**).
 *
 * The fields only one Kind uses — the age statement and the strength of a spirit, the
 * appellation of a wine — are nullable columns here (ADR-0002). `unverified` is the mark an
 * assistant-created Label carries until the owner has looked at it (ADR-0004). It always has
 * at least one Vintage; that, and what a Kind without vintages allows, are triggers in the
 * migration because a check cannot read another table.
 */
export const labels = pgTable(
  "labels",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('lbl')`),
    producer: text(),
    name: text().notNull(),
    kindId: text().notNull(),
    country: text(),
    region: text(),
    appellation: text(),
    grapes: text().array().notNull().default(sql`'{}'::text[]`),
    ageStatement: text(),
    strength: numeric({ precision: 4, scale: 1 }),
    unverified: boolean().notNull().default(false),
    ownImageUrl: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "labels_kind_exists", columns: [table.kindId], foreignColumns: [kinds.id] }),
    index("labels_kind_id_idx").on(table.kindId),
    check("labels_id_is_prefixed", prefixed(table.id, "lbl")),
    check(
      "labels_name_is_not_blank",
      sql`${table.name} = btrim(${table.name}) and ${table.name} <> ''`
    ),
    check("labels_producer_is_not_blank", absentOrSaid(table.producer)),
    check("labels_country_is_not_blank", absentOrSaid(table.country)),
    check("labels_region_is_not_blank", absentOrSaid(table.region)),
    check("labels_appellation_is_not_blank", absentOrSaid(table.appellation)),
    check("labels_age_statement_is_not_blank", absentOrSaid(table.ageStatement)),
    check("labels_grapes_are_not_blank", sql`every_one_is_said(${table.grapes})`),
    check(
      "labels_strength_is_a_percentage",
      sql`${table.strength} is null or (${table.strength} > 0 and ${table.strength} <= 100)`
    ),
    check("labels_own_image_url_is_a_web_address", absentOrWebAddress(table.ownImageUrl)),
  ]
);

/**
 * One year of a Label, or its NV, or its unknown (`CONTEXT.md`, **Vintage**; ADR-0010).
 *
 * `dating` says which of the three it is and `year` is present exactly when it is a year.
 * A year is unique per Label, and there is at most one NV and at most one unknown — the two
 * partial unique indexes below. Bottles and Tastings attach here, never to the Label.
 */
export const vintages = pgTable(
  "vintages",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('vtg')`),
    labelId: text().notNull(),
    dating: text().notNull(),
    year: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "vintages_label_exists",
      columns: [table.labelId],
      foreignColumns: [labels.id],
    }),
    unique("vintages_one_per_year_per_label").on(table.labelId, table.year),
    uniqueIndex("vintages_one_nv_per_label").on(table.labelId).where(sql`${table.dating} = 'nv'`),
    uniqueIndex("vintages_one_unknown_per_label")
      .on(table.labelId)
      .where(sql`${table.dating} = 'unknown'`),
    check("vintages_id_is_prefixed", prefixed(table.id, "vtg")),
    check(
      "vintages_dating_is_a_year_nv_or_unknown",
      sql`${table.dating} in ('year', 'nv', 'unknown')`
    ),
    check(
      "vintages_year_is_there_exactly_when_dated_by_year",
      sql`(${table.dating} = 'year') = (${table.year} is not null)`
    ),
    check(
      "vintages_year_is_plausible",
      sql`${table.year} is null or ${table.year} between 1800 and 2200`
    ),
  ]
);

/**
 * Where a Label was found: an external catalogue, that catalogue's own id for it, and the
 * image and page it showed (`CONTEXT.md`, **Source**; ADR-0006).
 *
 * The image is **hotlinked**: its address is stored, never its bytes. One record in a Source
 * names one Label of ours, which is why `(source, id_at_source)` is unique across the table
 * and not per Label — two Labels claiming the same Vivino wine is a merge waiting to happen.
 */
export const labelSources = pgTable(
  "label_sources",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('src')`),
    labelId: text().notNull(),
    source: text().notNull(),
    idAtSource: text().notNull(),
    imageUrl: text(),
    pageUrl: text(),
    lookedUpAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "label_sources_label_exists",
      columns: [table.labelId],
      foreignColumns: [labels.id],
    }),
    unique("label_sources_one_label_per_record").on(table.source, table.idAtSource),
    index("label_sources_label_id_idx").on(table.labelId),
    check("label_sources_id_is_prefixed", prefixed(table.id, "src")),
    check("label_sources_source_is_known", sql`${table.source} in ('openfoodfacts', 'vivino')`),
    check(
      "label_sources_id_at_source_is_not_blank",
      sql`${table.idAtSource} = btrim(${table.idAtSource}) and ${table.idAtSource} <> ''`
    ),
    check("label_sources_image_url_is_a_web_address", absentOrWebAddress(table.imageUrl)),
    check("label_sources_page_url_is_a_web_address", absentOrWebAddress(table.pageUrl)),
  ]
);
