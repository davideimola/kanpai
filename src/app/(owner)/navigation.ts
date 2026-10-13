/**
 * THE DESTINATIONS, as data rather than as markup — tsundoku's map, and for its reasons: the
 * wall in `./shell.test.ts` compares it with the route tree, which a list inside a client
 * component could not be imported for, and the phone and the desk render this one list, so a
 * screen cannot exist at one width and not the other.
 *
 * **One list, in the order the desk's rail shows it**: Diary, Cellar, Add, Wishlist, Palate,
 * To check, Settings. Where each one goes on a phone is a property of the destination rather
 * than a second list: the bottom bar carries what is opened away from a desk, with the act —
 * Add — as the round button in its middle; the header carries the two that are not places to
 * go so much as chores, *To check* (with how many wait) and *Settings*.
 *
 * **A destination is here only once its screen exists** (`./shell.test.ts` fails otherwise).
 * Add came with S6, and the Wishlist and the Palate with S7 (spec §5): with all three in, the
 * bar is the agreed five — Diary, Cellar, the round Add, Wishlist, Palate.
 */

export type Destination = {
  /** The route, exactly as it appears in the tree. The wall compares these to the files. */
  readonly href: string;
  /** The same word at both widths. */
  readonly label: string;
  /**
   * Where a phone shows it: on the bottom bar, as the bar's round button in the middle (the one
   * act, not a place), or in the header above the page.
   */
  readonly phone: "bar" | "act" | "header";
  /** Carries how many Labels wait to be checked beside its name. */
  readonly counted?: true;
};

export const DESTINATIONS: readonly Destination[] = [
  { href: "/", label: "Diary", phone: "bar" },
  { href: "/cellar", label: "Cellar", phone: "bar" },
  { href: "/add", label: "Add", phone: "act" },
  { href: "/wishlist", label: "Wishlist", phone: "bar" },
  { href: "/palate", label: "Palate", phone: "bar" },
  { href: "/to-check", label: "To check", phone: "header", counted: true },
  { href: "/settings", label: "Settings", phone: "header" },
];

/**
 * The phone's bottom bar: the places, in map order, with the act in the middle when there is
 * one — Diary, Cellar, **+**, Wishlist, Palate.
 */
export function onTheBar(destinations: readonly Destination[] = DESTINATIONS): Destination[] {
  const places = destinations.filter((destination) => destination.phone === "bar");
  const act = destinations.find((destination) => destination.phone === "act");
  if (!act) return places;
  const middle = Math.ceil(places.length / 2);
  return [...places.slice(0, middle), act, ...places.slice(middle)];
}

/** The phone's header: the chores, in map order. */
export function inTheHeader(destinations: readonly Destination[] = DESTINATIONS): Destination[] {
  return destinations.filter((destination) => destination.phone === "header");
}

/**
 * Which destination the owner is inside, so the navigation says so without them reading the
 * URL. On whole segments, because `/` is a prefix of every path and a Label's page is inside
 * no destination of its own — it is reached from the Cellar, the diary and the to-check list
 * alike, so it marks none of them.
 */
export function currentDestination(pathname: string): string | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "") return "/";

  return DESTINATIONS.find(
    (destination) =>
      destination.href !== "/" &&
      (path === destination.href || path.startsWith(`${destination.href}/`))
  )?.href;
}
