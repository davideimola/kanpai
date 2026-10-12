import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";

/**
 * Which Vintage of a Label is meant: a year, `nv` or `unknown` (ADR-0010).
 *
 * **NV** is the producer blending years — almost every spirit, a non-vintage sparkling.
 * **Unknown** is a year nobody wrote down. Never `nv` for *I don't know*.
 */
export type Dating = number | "nv" | "unknown";

/** The two columns a `Dating` is stored as. */
export function asColumns(dating: Dating): {
  dating: "year" | "nv" | "unknown";
  year: number | null;
} {
  return typeof dating === "number" ? { dating: "year", year: dating } : { dating, year: null };
}

/**
 * A Vintage named by its Label and its dating rather than by its id — *the 2019 of this
 * Label*. What a door hands over when it knows the Label and the year and not whether that
 * year's Vintage exists yet.
 */
export type VintageOf = { labelId: string; dating: Dating };

const NO_SUCH_LABEL = "No Label has that id.";

/** What the owner reads when the database refuses a Vintage, by the rule that refused it. */
export function vintageRefusal(constraint: string | undefined): string {
  switch (constraint) {
    case "vintages_label_exists":
      return NO_SUCH_LABEL;
    case "vintages_of_a_kind_without_vintages_are_nv":
      return "That Label's Kind has no vintages: its one Vintage is NV.";
    case "vintages_year_is_plausible":
      return "A Vintage's year is between 1800 and 2200.";
    case "vintages_year_is_there_exactly_when_dated_by_year":
      return "A Vintage is a year, NV or unknown.";
    default:
      return "That Vintage could not be recorded.";
  }
}

/**
 * The Vintage of a Label for a year, NV or unknown — found, or created when it is not there.
 *
 * This is how every door reaches a Vintage to hang a Bottle or a Tasting on: *the 2019 of
 * this Label* is a question with one answer, so asking it twice never makes two. A year on
 * a Label whose Kind has no vintages is refused (ADR-0002, ADR-0010).
 */
export async function ensureVintage(
  labelId: string,
  dating: Dating,
  run: Executor = query
): Promise<string> {
  const { dating: kind, year } = asColumns(dating);

  return refusing(async () => {
    // `on conflict do nothing` with no target: the one-per-year constraint and the two
    // partial indexes are all the same answer — it is already there.
    const created = await run<{ id: string }>(
      `insert into vintages (label_id, dating, year) values ($1, $2, $3)
       on conflict do nothing
       returning id`,
      [labelId, kind, year]
    );
    if (created[0]) return created[0].id;

    const found = await run<{ id: string }>(
      `select id from vintages
        where label_id = $1 and dating = $2 and year is not distinct from $3`,
      [labelId, kind, year]
    );
    // Not reachable unless a row was removed between the two statements.
    if (!found[0]) throw new Refusal("not-found", "That Vintage could not be found.");
    return found[0].id;
  }, vintageRefusal);
}

/**
 * The id of a Vintage named either way: an id is itself, and a Label with a dating is found
 * or created by `ensureVintage`, on `run`. For a verb that hangs something on a Vintage and
 * takes both.
 */
export async function vintageIdOf(
  vintage: string | VintageOf,
  run: Executor = query
): Promise<string> {
  return typeof vintage === "string"
    ? vintage
    : ensureVintage(vintage.labelId, vintage.dating, run);
}

/** What learning a year moved, and where. */
export type YearSet = {
  /** The year's Vintage, which may have just been created. */
  vintageId: string;
  movedBottles: number;
  movedTastings: number;
  /** Whether the unknown Vintage is still there — it goes when nothing is left on it. */
  unknownRemains: boolean;
};

/**
 * The owner has learned the year: move the chosen Bottles and Tastings from the Label's
 * unknown Vintage to the year's, creating that one if needed (ADR-0010). Nothing is
 * re-entered.
 *
 * Name the Bottles and Tastings to move; name **neither** and everything on the unknown
 * Vintage moves, its Wishes too. One that is not on the unknown Vintage is refused, and
 * nothing moves. The unknown Vintage is removed once nothing is left on it — an empty
 * *unknown* says nothing — and kept while something still waits for its year.
 */
export async function setVintageYear(input: {
  labelId: string;
  year: number;
  bottleIds?: readonly string[];
  tastingIds?: readonly string[];
}): Promise<YearSet> {
  if (!Number.isInteger(input.year)) {
    throw new Refusal("invalid", "A year is a whole number, like 2018.");
  }
  const everything = input.bottleIds === undefined && input.tastingIds === undefined;

  return refusing(
    () =>
      transaction(async (run) => {
        const unknown = await run<{ id: string }>(
          "select id from vintages where label_id = $1 and dating = 'unknown'",
          [input.labelId]
        );
        if (!unknown[0]) {
          throw new Refusal("not-found", "That Label has no unknown Vintage to set a year on.");
        }
        const from = unknown[0].id;
        const to = await ensureVintage(input.labelId, input.year, run);

        const movedBottles = await moveFrom(run, "bottles", from, to, input.bottleIds, everything);
        const movedTastings = await moveFrom(
          run,
          "tastings",
          from,
          to,
          input.tastingIds,
          everything
        );
        if (everything) {
          await run("update wishes set vintage_id = $2 where vintage_id = $1", [from, to]);
        }

        const removed = await run(
          `delete from vintages v
            where v.id = $1
              and not exists (select 1 from bottles where vintage_id = v.id)
              and not exists (select 1 from tastings where vintage_id = v.id)
              and not exists (select 1 from wishes where vintage_id = v.id)
            returning id`,
          [from]
        );

        return { vintageId: to, movedBottles, movedTastings, unknownRemains: removed.length === 0 };
      }),
    vintageRefusal
  );
}

// One of the two moves. `table` is one of two literals written above, never a value from a
// caller. `ids` undefined moves all of them when everything is moving, and none otherwise.
async function moveFrom(
  run: Executor,
  table: "bottles" | "tastings",
  from: string,
  to: string,
  ids: readonly string[] | undefined,
  everything: boolean
): Promise<number> {
  if (everything) {
    return (
      await run(`update ${table} set vintage_id = $2 where vintage_id = $1 returning id`, [
        from,
        to,
      ])
    ).length;
  }
  if (!ids || ids.length === 0) return 0;

  const wanted = [...new Set(ids)];
  const moved = await run(
    `update ${table} set vintage_id = $2 where vintage_id = $1 and id = any($3::text[]) returning id`,
    [from, to, wanted]
  );
  if (moved.length !== wanted.length) {
    const what = table === "bottles" ? "Bottles" : "Tastings";
    throw new Refusal(
      "not-found",
      `Some of those ${what} are not on this Label's unknown Vintage.`
    );
  }
  return moved.length;
}
