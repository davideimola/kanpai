import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { type Executor, transaction } from "../transaction.ts";
import { asPrice, isADay, said } from "../typed.ts";
import { type VintageOf, vintageIdOf } from "./vintage.ts";

/**
 * How much is left of an open Bottle, by eye (ADR-0007). Four coarse steps are what the
 * owner can judge; anything finer would be invented. A closed set the database also holds
 * (`bottles_level_is_known`), and not a vocabulary that grows like the Kinds.
 */
export type Level = "full" | "3/4" | "1/2" | "1/4";

/** What the owner may say about how a Bottle came into the house. */
export type Purchase = {
  /** The day it was bought, `2026-10-12`. */
  boughtOn?: string | null;
  /** What it cost, as the owner typed it: `24.50`. */
  price?: string | null;
  /** The shop, the winery, the friend. */
  boughtWhere?: string | null;
};

const NO_SUCH_BOTTLE = "No Bottle has that id.";

function bottleRefusal(constraint: string | undefined): string {
  switch (constraint) {
    case "bottles_vintage_exists":
      return "No Vintage has that id.";
    case "bottles_level_only_when_open":
      return "Only an open Bottle has a Level.";
    case "bottles_level_is_known":
      return "A Level is full, 3/4, 1/2 or 1/4.";
    case "bottles_finished_after_opened":
      return "A Bottle is finished after it was opened, not before.";
    case "bottles_price_is_not_negative":
      return "A price is not negative.";
    case "bottles_finished_is_kept":
      return "A finished Bottle is kept: it is history.";
    default:
      return "That Bottle could not be recorded.";
  }
}

/**
 * Put `count` closed Bottles of one Vintage into the Cellar, bought together. Returns their
 * ids, in the order they were added.
 *
 * The Vintage is named by its id, or by its Label and dating — found or created in the same
 * transaction, so refused Bottles leave no new Vintage behind.
 */
export async function addBottles(
  vintage: string | VintageOf,
  count: number,
  purchase: Purchase = {}
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Refusal("invalid", "Add at least one Bottle, and a whole number of them.");
  }
  const price = asPrice(purchase.price);
  if (price === undefined) throw new Refusal("invalid", "A price is a number, like 24.50.");
  if (purchase.boughtOn && !isADay(purchase.boughtOn)) {
    throw new Refusal("invalid", "A day is written 2026-10-12.");
  }

  const write = async (run: Executor) =>
    run<{ id: string }>(
      `insert into bottles (vintage_id, bought_on, price, bought_where)
       select $1, $2::date, $3::numeric, $4 from generate_series(1, $5)
       returning id`,
      [
        await vintageIdOf(vintage, run),
        purchase.boughtOn ?? null,
        price,
        said(purchase.boughtWhere) ?? null,
        count,
      ]
    );

  const rows = await refusing(
    () => (typeof vintage === "string" ? write(query) : transaction(write)),
    bottleRefusal
  );
  return rows.map((row) => row.id);
}

/**
 * Open a closed Bottle. It starts `full` unless the owner says otherwise — a bottle opened
 * at someone else's table and brought home half drunk is not full.
 */
export async function openBottle(
  bottleId: string,
  options: { level?: Level; at?: Date } = {}
): Promise<void> {
  const updated = await refusing(
    () =>
      query(
        `update bottles set state = 'open', level = $2, opened_at = coalesce($3, now())
          where id = $1 and state = 'closed'
          returning id`,
        [bottleId, options.level ?? "full", options.at ?? null]
      ),
    bottleRefusal
  );
  if (updated.length === 0) await refuseFor(bottleId, "Only a closed Bottle can be opened.");
}

/**
 * How much is left of an open Bottle now. A closed or finished one has no Level, and the
 * database says so (`bottles_level_only_when_open`).
 */
export async function setBottleLevel(bottleId: string, level: Level): Promise<void> {
  const updated = await refusing(
    () => query("update bottles set level = $2 where id = $1 returning id", [bottleId, level]),
    bottleRefusal
  );
  if (updated.length === 0) throw new Refusal("not-found", NO_SUCH_BOTTLE);
}

/**
 * The Bottle is empty. It stays, as history, and leaves the Cellar (ADR-0007).
 *
 * A closed Bottle may be finished directly — a wine opened and drunk the same evening is one
 * press — and is then opened and finished at the same moment. Finishing does not record a
 * Tasting; the assistant offers to.
 */
export async function finishBottle(bottleId: string, options: { at?: Date } = {}): Promise<void> {
  const updated = await refusing(
    () =>
      query(
        `update bottles
            set state = 'finished',
                level = null,
                opened_at = coalesce(opened_at, $2, now()),
                finished_at = coalesce($2, now())
          where id = $1 and state <> 'finished'
          returning id`,
        [bottleId, options.at ?? null]
      ),
    bottleRefusal
  );
  if (updated.length === 0) await refuseFor(bottleId, "That Bottle is already finished.");
}

/**
 * Take a Bottle out of the record altogether — one the assistant added by mistake, or added
 * twice. Not how a Bottle leaves the Cellar: that is finishing it. **A finished Bottle is never
 * deleted** — it is history (ADR-0007) — and the database refuses it
 * (`bottles_finished_is_kept`).
 */
export async function deleteBottle(bottleId: string): Promise<void> {
  const deleted = await refusing(
    () => query("delete from bottles where id = $1 returning id", [bottleId]),
    bottleRefusal
  );
  if (deleted.length === 0) throw new Refusal("not-found", NO_SUCH_BOTTLE);
}

// Nothing was updated: either there is no such Bottle, or it is in the wrong State.
async function refuseFor(bottleId: string, wrongState: string): Promise<never> {
  const found = await query("select 1 from bottles where id = $1", [bottleId]);
  throw found.length === 0
    ? new Refusal("not-found", NO_SUCH_BOTTLE)
    : new Refusal("not-allowed", wrongState);
}
