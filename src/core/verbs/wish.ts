import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { said } from "../typed.ts";

/** How a Wish ended: bought (a Bottle), tasted (a Tasting), or dropped. */
export type WishEnding = "bought" | "tasted" | "dropped";

const NO_SUCH_WISH = "No Wish has that id.";

/**
 * Want to try or buy something (`CONTEXT.md`, **Wish**): a Label, or one Vintage of it —
 * exactly one of the two — with why, and where the idea came from.
 */
export async function addWish(wish: {
  labelId?: string | null;
  vintageId?: string | null;
  why?: string | null;
  /** The assistant suggested it, a friend, seen at the wine shop. */
  cameFrom?: string | null;
}): Promise<string> {
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
