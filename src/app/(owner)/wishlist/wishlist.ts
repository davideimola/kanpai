import { dateAsWritten } from "../words";

// What the wishlist says about a Wish, in words: which list is shown, and how a closed Wish
// ended. Pure functions over plain values, tested beside themselves (`./wishlist.test.ts`).

/** Which Wishes the page shows: the open ones, unless the address asks for the closed. */
export function whichWishes(show: string | string[] | undefined): "open" | "closed" {
  return show === "closed" ? "closed" : "open";
}

const ENDED: Record<"bought" | "tasted" | "dropped", string> = {
  bought: "Bought",
  tasted: "Tasted",
  dropped: "Dropped",
};

/** How a Wish ended, and when: `Bought 12 October`, `Dropped 3 May 2025`. */
export function endedAsWritten(
  closedAs: "bought" | "tasted" | "dropped",
  closedAt: Date,
  today: string
): string {
  return `${ENDED[closedAs]} ${dateAsWritten(closedAt, today)}`;
}

/** The one line under a Wish: where the idea came from, and when it was added. */
export function cameFromAsWritten(cameFrom: string | null, createdAt: Date, today: string): string {
  const added = `added ${dateAsWritten(createdAt, today)}`;
  return cameFrom ? `${cameFrom}, ${added}` : `Added ${dateAsWritten(createdAt, today)}`;
}
