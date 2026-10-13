import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { said } from "../typed.ts";

/** How a Wish ended: bought (a Bottle), tasted (a Tasting), or dropped. */
export type WishEnding = "bought" | "tasted" | "dropped";

const NO_SUCH_WISH = "No Wish has that id.";

/**
 * Refuse a second open Wish on a Label — one naming it, or any of its Vintages, other than
 * `except`. The Label is named by its id or by one of its Vintages' (`CONTEXT.md`, **Wish**: a
 * Label is wished for once).
 */
async function refuseASecondWish(
  on: { labelId?: string | null; vintageId?: string | null },
  except?: string
): Promise<void> {
  const [held] = await query<{ name: string }>(
    `select l.name
       from wishes w
       left join vintages v on v.id = w.vintage_id
       join labels l on l.id = coalesce(w.label_id, v.label_id)
      where w.closed_as is null
        and w.id is distinct from $3
        and l.id = coalesce($1, (select label_id from vintages where id = $2))
      limit 1`,
    [on.labelId ?? null, on.vintageId ?? null, except ?? null]
  );
  if (held) {
    throw new Refusal(
      "already-exists",
      `${held.name} is on the wishlist already. Its open Wish says why; close it before wishing again.`
    );
  }
}

/**
 * Want to try or buy something (`CONTEXT.md`, **Wish**): a Label, or one Vintage of it —
 * exactly one of the two — with why, and where the idea came from. Refused when the Label
 * already has an open Wish, on it or on any of its Vintages: a second says nothing the first
 * does not.
 */
export async function addWish(wish: {
  labelId?: string | null;
  vintageId?: string | null;
  why?: string | null;
  /** The assistant suggested it, a friend, seen at the wine shop. */
  cameFrom?: string | null;
}): Promise<string> {
  await refuseASecondWish(wish);
  const [row] = await refusing(
    () =>
      query<{ id: string }>(
        `insert into wishes (label_id, vintage_id, why, came_from)
         values ($1, $2, $3, $4)
         returning id`,
        [
          wish.labelId ?? null,
          wish.vintageId ?? null,
          said(wish.why) ?? null,
          said(wish.cameFrom) ?? null,
        ]
      ),
    (constraint) => {
      switch (constraint) {
        case "wishes_label_exists":
          return "No Label has that id.";
        case "wishes_vintage_exists":
          return "No Vintage has that id.";
        case "wishes_name_a_label_or_a_vintage":
          return "A Wish names a Label or one of its Vintages — one of the two.";
        default:
          return "That Wish could not be recorded.";
      }
    }
  );
  if (!row) throw new Error("insert into wishes returned no row");
  return row.id;
}

/**
 * Close a Wish: it was bought, tasted, or dropped. Closing records only the ending — the
 * Bottle bought or the Tasting recorded is its own verb, which the caller also calls.
 */
export async function closeWish(
  wishId: string,
  as: WishEnding,
  options: { at?: Date } = {}
): Promise<void> {
  const updated = await refusing(
    () =>
      query(
        `update wishes set closed_as = $2, closed_at = coalesce($3, now())
          where id = $1 and closed_as is null
          returning id`,
        [wishId, as, options.at ?? null]
      ),
    (constraint) =>
      constraint === "wishes_closed_as_is_known"
        ? "A Wish is closed as bought, tasted or dropped."
        : "That Wish could not be closed."
  );
  if (updated.length > 0) return;

  const found = await query("select 1 from wishes where id = $1", [wishId]);
  throw found.length === 0
    ? new Refusal("not-found", NO_SUCH_WISH)
    : new Refusal("not-allowed", "That Wish is already closed.");
}

/**
 * Undo a close: the Wish is open again, as if it had never ended — what the wishlist's *Undo*
 * does after *Drop*, and after *Bought* or *Tasted* when nothing was bought or tasted after all.
 * Whatever was recorded meanwhile — a Bottle, a Tasting — is its own record and stays.
 * Refused when the Label has been wished for again since: it has an open Wish already.
 */
export async function reopenWish(wishId: string): Promise<void> {
  const [wish] = await query<{ labelId: string | null; vintageId: string | null }>(
    `select label_id as "labelId", vintage_id as "vintageId" from wishes where id = $1`,
    [wishId]
  );
  if (wish) await refuseASecondWish(wish, wishId);
  const updated = await query(
    `update wishes set closed_as = null, closed_at = null
      where id = $1 and closed_as is not null
      returning id`,
    [wishId]
  );
  if (updated.length > 0) return;

  const found = await query("select 1 from wishes where id = $1", [wishId]);
  throw found.length === 0
    ? new Refusal("not-found", NO_SUCH_WISH)
    : new Refusal("not-allowed", "That Wish is still open.");
}
