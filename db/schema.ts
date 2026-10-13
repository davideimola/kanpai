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
    // Which Source a search by name asks first for a Label of this Kind (ADR-0011): Vivino for
    // wine, grappa and sake, Open Food Facts for everything else. A row's, like `has_vintages`,
    // so a Kind a copy's owner adds is routed by its row and never by a list in code.
    firstSource: text().notNull().default("openfoodfacts"),
    // How a Label of this Kind is drawn (ADR-0012): the silhouette's shape and the colour of
    // what is in it. A row's, like the two above, so a Kind a copy's owner adds is drawn by
    // its own row; a Label may override the shape and never the liquid.
    bottleShape: text().notNull().default("bordeaux"),
    liquid: text().notNull().default("clear"),
    // Hidden from every list a form or an assistant picks from, and kept: a Kind that has
    // Labels is never deleted, so retiring one is hiding it (spec §4, `/settings`).
    hidden: boolean().notNull().default(false),
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
    check("kinds_first_source_is_known", sql`${table.firstSource} in ('openfoodfacts', 'vivino')`),
    check("kinds_bottle_shape_is_known", bottleShapeIsKnown(table.bottleShape)),
    check(
      "kinds_liquid_is_known",
      sql`${table.liquid} in ('red', 'white', 'rose', 'orange', 'amber', 'clear')`
    ),
  ]
);

// ── Helpers for the checks every table repeats ─────────────────────────────────────────────

/**
 * The silhouettes a bottle is drawn as (ADR-0012). A closed set, like a Bottle's Level: each
 * one is a drawing in `src/components/silhouette.tsx`, and a shape with no drawing is refused
 * here rather than drawn as nothing.
 */
function bottleShapeIsKnown(column: AnyPgColumn) {
  return sql`${column} in ('bordeaux', 'burgundy', 'flute', 'spirit', 'sake', 'beer')`;
}

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
    // The Kind's silhouette, overridden for this Label — a Riesling in a flute, a gin in a
    // squat decanter-like bottle. `null` is the Kind's (ADR-0012).
    bottleShape: text(),
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
    check(
      "labels_bottle_shape_is_known",
      sql`${table.bottleShape} is null or ${bottleShapeIsKnown(table.bottleShape)}`
    ),
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
 * image and page it showed (`CONTEXT.md`, **Source**; ADR-0011).
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

/**
 * One physical bottle the owner has had in the house (`CONTEXT.md`, **Bottle**; ADR-0007).
 *
 * Its State is `closed`, `open` or `finished`, and only an open one has a Level. The dates
 * follow the State: a closed Bottle was never opened, an open one has been and is not
 * finished, a finished one has both. A finished Bottle is kept — history, not stock — and a
 * trigger in the migration refuses deleting it.
 */
export const bottles = pgTable(
  "bottles",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('btl')`),
    vintageId: text().notNull(),
    state: text().notNull().default("closed"),
    level: text(),
    boughtOn: date({ mode: "string" }),
    price: numeric({ precision: 10, scale: 2 }),
    boughtWhere: text(),
    openedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "bottles_vintage_exists",
      columns: [table.vintageId],
      foreignColumns: [vintages.id],
    }),
    index("bottles_vintage_id_idx").on(table.vintageId),
    check("bottles_id_is_prefixed", prefixed(table.id, "btl")),
    check("bottles_state_is_known", sql`${table.state} in ('closed', 'open', 'finished')`),
    check("bottles_level_is_known", sql`${table.level} in ('full', '3/4', '1/2', '1/4')`),
    check(
      "bottles_level_only_when_open",
      sql`(${table.state} = 'open') = (${table.level} is not null)`
    ),
    check(
      "bottles_dates_follow_the_state",
      sql`case ${table.state}
            when 'closed' then ${table.openedAt} is null and ${table.finishedAt} is null
            when 'open' then ${table.openedAt} is not null and ${table.finishedAt} is null
            else ${table.openedAt} is not null and ${table.finishedAt} is not null
          end`
    ),
    check(
      "bottles_finished_after_opened",
      sql`${table.finishedAt} is null or ${table.finishedAt} >= ${table.openedAt}`
    ),
    check("bottles_price_is_not_negative", sql`${table.price} is null or ${table.price} >= 0`),
    check("bottles_bought_where_is_not_blank", absentOrSaid(table.boughtWhere)),
  ]
);

/**
 * One occasion the owner drank something, and what they thought of it (`CONTEXT.md`,
 * **Tasting**).
 *
 * It points at a Vintage **or** carries a free description — exactly one (ADR-0005): *a
 * Primitivo by the glass* counts even when nobody wrote the producer down. Its Rating is
 * optional and, when given, one to five in half steps (ADR-0003). Two Tastings of the same
 * Vintage are two rows: nothing here is unique per Vintage, because the second may disagree
 * with the first and that disagreement is information.
 *
 * `food` is both the occasion's food and the fourth guided answer (*with what food?*); the
 * other three guided answers have a column each.
 */
export const tastings = pgTable(
  "tastings",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('tst')`),
    vintageId: text(),
    description: text(),
    tastedOn: date({ mode: "string" }).notNull().default(sql`current_date`),
    place: text(),
    food: text(),
    company: text(),
    rating: numeric({ precision: 2, scale: 1 }),
    notes: text(),
    likedIt: text(),
    bodyAndFeel: text(),
    remindedOf: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "tastings_vintage_exists",
      columns: [table.vintageId],
      foreignColumns: [vintages.id],
    }),
    index("tastings_vintage_id_idx").on(table.vintageId),
    index("tastings_tasted_on_idx").on(table.tastedOn),
    check("tastings_id_is_prefixed", prefixed(table.id, "tst")),
    check(
      "tastings_on_a_vintage_or_described",
      sql`(${table.vintageId} is null) <> (${table.description} is null)`
    ),
    check(
      "tastings_rating_is_one_to_five_in_halves",
      sql`${table.rating} is null or (${table.rating} between 1 and 5 and ${table.rating} * 2 = round(${table.rating} * 2))`
    ),
    check("tastings_description_is_not_blank", absentOrWritten(table.description)),
    check("tastings_place_is_not_blank", absentOrSaid(table.place)),
    check("tastings_food_is_not_blank", absentOrSaid(table.food)),
    check("tastings_company_is_not_blank", absentOrSaid(table.company)),
    check("tastings_notes_are_not_blank", absentOrWritten(table.notes)),
    check("tastings_liked_it_is_not_blank", absentOrWritten(table.likedIt)),
    check("tastings_body_and_feel_is_not_blank", absentOrWritten(table.bodyAndFeel)),
    check("tastings_reminded_of_is_not_blank", absentOrWritten(table.remindedOf)),
  ]
);

/**
 * A Label or a Vintage the owner wants to try or buy (`CONTEXT.md`, **Wish**).
 *
 * It names exactly one of the two. It is open until closed as `bought`, `tasted` or
 * `dropped`, and the word and the moment it was closed go together.
 */
export const wishes = pgTable(
  "wishes",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('wish')`),
    labelId: text(),
    vintageId: text(),
    why: text(),
    cameFrom: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAs: text(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "wishes_label_exists",
      columns: [table.labelId],
      foreignColumns: [labels.id],
    }),
    foreignKey({
      name: "wishes_vintage_exists",
      columns: [table.vintageId],
      foreignColumns: [vintages.id],
    }),
    index("wishes_label_id_idx").on(table.labelId),
    index("wishes_vintage_id_idx").on(table.vintageId),
    check("wishes_id_is_prefixed", prefixed(table.id, "wish")),
    check(
      "wishes_name_a_label_or_a_vintage",
      sql`(${table.labelId} is null) <> (${table.vintageId} is null)`
    ),
    check("wishes_closed_as_is_known", sql`${table.closedAs} in ('bought', 'tasted', 'dropped')`),
    check(
      "wishes_closed_as_and_closed_at_go_together",
      sql`(${table.closedAs} is null) = (${table.closedAt} is null)`
    ),
    check("wishes_why_is_not_blank", absentOrWritten(table.why)),
    check("wishes_came_from_is_not_blank", absentOrSaid(table.cameFrom)),
  ]
);

/**
 * The owner's taste, in prose (`CONTEXT.md`, **Palate**): an instruction to the external
 * sommelier, not a note to self.
 *
 * There is exactly one. Its id can only be `palate`, which makes a second row impossible;
 * the migration inserts the one, empty, and a trigger refuses taking it away.
 */
export const palate = pgTable(
  "palate",
  {
    id: text().primaryKey().default("palate"),
    prose: text().notNull().default(""),
    updatedAt: timestamp({ withTimezone: true }),
  },
  (table) => [check("palate_is_the_only_one", sql`${table.id} = 'palate'`)]
);

/**
 * A credential the MCP door accepts (ADR-0009): a bearer token the owner issued, named after
 * where it went — *Claude*, *laptop*, *tunnel* — and shown once.
 *
 * **The secret is never stored**, only its SHA-256, so a copy of this table opens nothing. A
 * name is unique among the tokens still live, so a revoked *Claude* leaves the name free for
 * the token that replaces it. Revoking is a moment, never a deletion: the row stays, so
 * *what called last week* still has an answer.
 *
 * Every credential the door accepts is a row here — OAuth's access tokens too (S10, ADR-0013)
 * — so the check on `/mcp` is written once. An OAuth access token is the same row with two
 * more facts: the **grant** it was issued under and the moment it **expires**, which go
 * together. A token the owner issued has neither, never expires, and is the only kind whose
 * name must be unique while live: OAuth's are named after the app, and a second connection
 * from ChatGPT is a second grant, not a clash.
 */
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('tok')`),
    name: text().notNull(),
    secretHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    // OAuth's (ADR-0013): the grant this token was issued under, and when it stops being
    // accepted. Both or neither — a token the owner issued has neither.
    grantId: text(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique("access_tokens_secret_hash_key").on(table.secretHash),
    uniqueIndex("access_tokens_name_is_unique_while_live")
      .on(table.name)
      .where(sql`${table.revokedAt} is null and ${table.grantId} is null`),
    foreignKey({
      name: "access_tokens_grant_exists",
      columns: [table.grantId],
      foreignColumns: [oauthGrants.id],
    }),
    index("access_tokens_by_grant").on(table.grantId),
    check(
      "access_tokens_grant_and_expiry_go_together",
      sql`(${table.grantId} is null) = (${table.expiresAt} is null)`
    ),
    check("access_tokens_id_is_prefixed", prefixed(table.id, "tok")),
    check(
      "access_tokens_name_is_not_blank",
      sql`${table.name} = btrim(${table.name}) and ${table.name} <> ''`
    ),
    check("access_tokens_secret_hash_is_a_sha256", sql`${table.secretHash} ~ '^[0-9a-f]{64}$'`),
  ]
);

/**
 * An application that registered itself to ask the owner for access (ADR-0013): ChatGPT,
 * Claude, the MCP inspector. **Its id is the OAuth `client_id`.**
 *
 * Written by Dynamic Client Registration (RFC 7591), which anyone may call — so a row here
 * grants nothing. It is a name and the addresses a code may be sent back to, and that is all
 * it is until the owner presses *Allow* on the consent screen. Public clients only: there is
 * no secret, and PKCE is what binds a code to the app that asked for it.
 */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('cli')`),
    name: text().notNull().default("An assistant"),
    redirectUris: text().array().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("oauth_clients_id_is_prefixed", prefixed(table.id, "cli")),
    check(
      "oauth_clients_name_is_not_blank",
      sql`${table.name} = btrim(${table.name}) and ${table.name} <> ''`
    ),
    check("oauth_clients_have_a_redirect_uri", sql`cardinality(${table.redirectUris}) > 0`),
  ]
);

/**
 * One authorization code, between the owner pressing *Allow* and the app redeeming it
 * (ADR-0013). Kept as a hash like every secret here; five minutes long, single use, and bound
 * to the app, the address it was sent to and the PKCE challenge the app sent first.
 *
 * `grant_id` is written when the code is redeemed, so a code presented a second time can
 * take down what the first use produced — OAuth 2.1's answer to a code that leaked.
 */
export const oauthCodes = pgTable(
  "oauth_codes",
  {
    codeHash: text().primaryKey(),
    clientId: text().notNull(),
    redirectUri: text().notNull(),
    codeChallenge: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    grantId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "oauth_codes_client_exists",
      columns: [table.clientId],
      foreignColumns: [oauthClients.id],
    }),
    foreignKey({
      name: "oauth_codes_grant_exists",
      columns: [table.grantId],
      foreignColumns: [oauthGrants.id],
    }),
    check("oauth_codes_code_hash_is_a_sha256", sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`),
    check("oauth_codes_challenge_is_an_s256", sql`${table.codeChallenge} ~ '^[A-Za-z0-9_-]{43}$'`),
    check(
      "oauth_codes_grant_only_once_used",
      sql`${table.grantId} is null or ${table.usedAt} is not null`
    ),
  ]
);

/**
 * The owner's yes to one app (ADR-0013): what `/settings` lists as a **connected app** and
 * revokes. Named after the app as it registered — *ChatGPT* — and holding the one refresh
 * token that app has, as a hash that **changes on every refresh**: unlike an access token's
 * secret, rotating is this row's job.
 *
 * The access tokens issued under it are rows in `access_tokens`, so the door's check stays
 * one check (ADR-0009). Revoking a grant revokes them in the same transaction, and like an
 * access token's, a grant's revocation is final.
 */
export const oauthGrants = pgTable(
  "oauth_grants",
  {
    id: text().primaryKey().default(sql`gen_prefixed_id('grant')`),
    clientId: text().notNull(),
    name: text().notNull(),
    refreshHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "oauth_grants_client_exists",
      columns: [table.clientId],
      foreignColumns: [oauthClients.id],
    }),
    unique("oauth_grants_refresh_hash_key").on(table.refreshHash),
    check("oauth_grants_id_is_prefixed", prefixed(table.id, "grant")),
    check(
      "oauth_grants_name_is_not_blank",
      sql`${table.name} = btrim(${table.name}) and ${table.name} <> ''`
    ),
    check("oauth_grants_refresh_hash_is_a_sha256", sql`${table.refreshHash} ~ '^[0-9a-f]{64}$'`),
  ]
);
