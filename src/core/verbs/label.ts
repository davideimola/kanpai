import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { changing, said } from "../typed.ts";
import { recordSource, type SourceRecord } from "./source.ts";
import { asColumns, type Dating, vintageRefusal } from "./vintage.ts";

/**
 * What identifies a Label, independent of the year (`CONTEXT.md`, **Label**).
 *
 * Only the name and the Kind are required: a Label read off a photograph arrives with what
 * was read and nothing else (ADR-0004). The fields only one Kind uses are here for every
 * Kind — the database does not say which Kind may fill which (ADR-0002).
 */
export type LabelFacts = {
  producer?: string | null;
  name: string;
  kindId: string;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  /** The grapes of a wine, or the base of a spirit. */
  grapes?: readonly string[];
  /** A spirit's age as the label says it: `16 years`, `XO`. */
  ageStatement?: string | null;
  /** Alcohol by volume, in percent. */
  strength?: number | null;
  /** A photograph the owner uploaded. The column exists; hosting it is not built yet. */
  ownImageUrl?: string | null;
};

/** A Label about to be created. */
export type NewLabel = LabelFacts & {
  /**
   * Whether the owner has not looked at it yet (ADR-0004). Required rather than defaulted:
   * the door that creates the Label is the one that knows who is creating it — the
   * assistant's, `true`; the owner's own, `false`.
   */
  unverified: boolean;
  /**
   * Its first Vintage. Left out, it is **unknown** for a Kind with vintages — the assistant
   * records unknown rather than guessing (ADR-0010) — and **NV** for one without.
   */
  vintage?: Dating;
  /**
   * The Source it was found in, recorded with it in the same transaction: a Label is never
   * left behind without the record it came from, nor a record without its Label (ADR-0011).
   */
  source?: SourceRecord;
};

const COLUMNS: Record<keyof LabelFacts, string> = {
  producer: "producer",
  name: "name",
  kindId: "kind_id",
  country: "country",
  region: "region",
  appellation: "appellation",
  grapes: "grapes",
  ageStatement: "age_statement",
  strength: "strength",
  ownImageUrl: "own_image_url",
};

const NO_SUCH_LABEL = "No Label has that id.";

/** What the owner reads when the database refuses a Label, by the rule that refused it. */
function labelRefusal(constraint: string | undefined): string {
  switch (constraint) {
    case "labels_kind_exists":
      return "No Kind has that id.";
    case "labels_name_is_not_blank":
      return "A Label has a name.";
    case "labels_strength_is_a_percentage":
      return "A strength is a percentage of alcohol, above 0 and at most 100.";
    case "labels_grapes_are_not_blank":
      return "Each grape is a name.";
    case "labels_own_image_url_is_a_web_address":
      return "An image is a web address, starting with http:// or https://.";
    case "labels_kind_without_vintages_keeps_only_nv":
      return "That Kind has no vintages, and this Label has a year or an unknown Vintage. Move or merge those first.";
    case "labels_have_a_vintage":
      return "A Label has at least one Vintage.";
    default:
      return constraint?.startsWith("vintages_")
        ? vintageRefusal(constraint)
        : "That Label could not be recorded.";
  }
}

/** The facts as stored: text trimmed, nothing for nothing, grapes each a name. */
function asStored(facts: Partial<LabelFacts>): Partial<Record<keyof LabelFacts, unknown>> {
  return {
    producer: said(facts.producer),
    name: facts.name === undefined ? undefined : facts.name.trim(),
    kindId: facts.kindId,
    country: said(facts.country),
    region: said(facts.region),
    appellation: said(facts.appellation),
    grapes: facts.grapes?.map((grape) => grape.trim()).filter((grape) => grape !== ""),
    ageStatement: said(facts.ageStatement),
    strength: facts.strength,
    ownImageUrl: said(facts.ownImageUrl),
  };
}

/**
 * Create a Label and its first Vintage, together (ADR-0003, ADR-0004) — and the Source it was
 * found in, when it was found in one (ADR-0011).
 *
 * The Vintage comes in the same transaction because a Label always has one — the database
 * checks that at commit. A Kind without vintages gets its NV and nothing else: a year or an
 * unknown on a whisky is refused (ADR-0010).
 */
export async function createLabel(
  input: NewLabel
): Promise<{ labelId: string; vintageId: string }> {
  const stored = asStored(input);

  return refusing(
    () =>
      transaction(async (run) => {
        const [label] = await run<{ id: string }>(
          `insert into labels (producer, name, kind_id, country, region, appellation, grapes,
                               age_statement, strength, unverified, own_image_url)
           values ($1, $2, $3, $4, $5, $6, coalesce($7::text[], '{}'), $8, $9, $10, $11)
           returning id`,
          [
            stored.producer ?? null,
            stored.name,
            stored.kindId,
            stored.country ?? null,
            stored.region ?? null,
            stored.appellation ?? null,
            stored.grapes ?? null,
            stored.ageStatement ?? null,
            stored.strength ?? null,
            input.unverified,
            stored.ownImageUrl ?? null,
          ]
        );
        if (!label) throw new Error("insert into labels returned no row");

        const vintageId = await firstVintage(run, label.id, input.vintage);
        if (input.source) await recordSource(label.id, input.source, run);
        return { labelId: label.id, vintageId };
      }),
    labelRefusal
  );
}

// The first Vintage, read off the Kind when the caller did not say: unknown for a Kind with
// vintages, NV for one without. Asked of the row, never of a list of Kind names (ADR-0002).
async function firstVintage(
  run: Executor,
  labelId: string,
  vintage: Dating | undefined
): Promise<string> {
  const given = vintage === undefined ? null : asColumns(vintage);
  const [row] = await run<{ id: string }>(
    `insert into vintages (label_id, dating, year)
     select l.id,
            coalesce($2, case when k.has_vintages then 'unknown' else 'nv' end),
            $3
       from labels l join kinds k on k.id = l.kind_id
      where l.id = $1
     returning id`,
    [labelId, given?.dating ?? null, given?.year ?? null]
  );
  if (!row) throw new Error("the new Label's Vintage was not written");
  return row.id;
}

/**
 * Correct what a Label says: any of its facts, the Kind included. Fields left out are left
 * alone; a field given as `null` is cleared.
 *
 * Moving a Label to a Kind without vintages while it has a year or an unknown Vintage is
 * refused (ADR-0010). It does not mark the Label verified: looking at it is its own act.
 */
export async function amendLabel(labelId: string, changes: Partial<LabelFacts>): Promise<void> {
  const { set, values } = changing(asStored(changes), COLUMNS, 2);
  if (set.length === 0) {
    await mustExist(labelId);
    return;
  }

  const updated = await refusing(
    () =>
      query(`update labels set ${set.join(", ")} where id = $1 returning id`, [labelId, ...values]),
    labelRefusal
  );
  if (updated.length === 0) throw new Refusal("not-found", NO_SUCH_LABEL);
}

/**
 * The owner has looked at the Label: it leaves the to-check page (ADR-0004). Marking one
 * that is already verified is not an error — the owner looked at it again.
 */
export async function markLabelVerified(labelId: string): Promise<void> {
  const updated = await query("update labels set unverified = false where id = $1 returning id", [
    labelId,
  ]);
  if (updated.length === 0) throw new Refusal("not-found", NO_SUCH_LABEL);
}

/**
 * Two Labels turn out to be the same one: fold `absorbedId` into `survivorId` (ADR-0004).
 *
 * Everything on the absorbed Label moves onto the survivor — its Vintages with their Bottles,
 * Tastings and Wishes, its own Wishes, its Sources — and then it is gone. Where both have the
 * same Vintage (the same year, or both NV, or both unknown) the two collapse into the
 * survivor's. The survivor keeps every fact it has and takes the absorbed one's only where it
 * had none; it stays as verified or unverified as it was.
 *
 * Refused as a whole, with nothing moved, when the survivor's Kind has no vintages and the
 * absorbed Label has a year or an unknown (ADR-0010).
 */
export async function mergeLabels(survivorId: string, absorbedId: string): Promise<void> {
  if (survivorId === absorbedId) {
    throw new Refusal("invalid", "A Label cannot be merged into itself.");
  }

  await refusing(
    () =>
      transaction(async (run) => {
        const found = await run<{ id: string }>(
          "select id from labels where id = any($1::text[])",
          [[survivorId, absorbedId]]
        );
        if (found.length !== 2) throw new Refusal("not-found", NO_SUCH_LABEL);

        await run(
          `update labels s
              set producer = coalesce(s.producer, a.producer),
                  country = coalesce(s.country, a.country),
                  region = coalesce(s.region, a.region),
                  appellation = coalesce(s.appellation, a.appellation),
                  grapes = case when cardinality(s.grapes) = 0 then a.grapes else s.grapes end,
                  age_statement = coalesce(s.age_statement, a.age_statement),
                  strength = coalesce(s.strength, a.strength),
                  own_image_url = coalesce(s.own_image_url, a.own_image_url)
             from labels a
            where s.id = $1 and a.id = $2`,
          [survivorId, absorbedId]
        );

        // The Vintages both Labels have collapse: what hangs on the absorbed one moves to the
        // survivor's twin, and the absorbed one goes.
        const twins = `select a.id as from_id, s.id as to_id
                         from vintages a
                         join vintages s
                           on s.label_id = $1
                          and s.dating = a.dating
                          and s.year is not distinct from a.year
                        where a.label_id = $2`;
        for (const table of ["bottles", "tastings", "wishes"] as const) {
          await run(
            `update ${table} x set vintage_id = t.to_id
               from (${twins}) t
              where x.vintage_id = t.from_id`,
            [survivorId, absorbedId]
          );
        }
        await run(`delete from vintages where id in (select from_id from (${twins}) t)`, [
          survivorId,
          absorbedId,
        ]);

        // The rest move whole.
        await run("update vintages set label_id = $1 where label_id = $2", [
          survivorId,
          absorbedId,
        ]);
        await run("update wishes set label_id = $1 where label_id = $2", [survivorId, absorbedId]);
        await run("update label_sources set label_id = $1 where label_id = $2", [
          survivorId,
          absorbedId,
        ]);
        await run("delete from labels where id = $1", [absorbedId]);
      }),
    (constraint) =>
      constraint === "vintages_of_a_kind_without_vintages_are_nv"
        ? "The Label kept has a Kind without vintages, and the other has a year or an unknown Vintage. Change the Kind first."
        : labelRefusal(constraint)
  );
}

async function mustExist(labelId: string): Promise<void> {
  const found = await query("select 1 from labels where id = $1", [labelId]);
  if (found.length === 0) throw new Refusal("not-found", NO_SUCH_LABEL);
}
