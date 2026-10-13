import { describe, expect, it } from "vitest";

import { isDrawn } from "@/components/glyphs";
import { SRC, sourceFiles } from "@/test/source-files";

import {
  currentDestination,
  DESTINATIONS,
  type Destination,
  inTheHeader,
  onTheBar,
} from "./navigation";

// A wall, beside `src/app/gated.test.ts` and for the same reason — tsundoku's, taken over with
// the shell. The failure it catches is silent: a screen nothing links to compiles and renders
// and is reached by nobody, and a link to a screen that does not exist yet is a 404 the owner
// meets on a phone. Add, the Wishlist and the Palate came in later slices (spec §5), which is
// exactly when that second failure is likely.
//
// A grep and pure functions: no DOM, no renderer, as the configuration's seams require.

const GROUP = "(owner)/";
const gated = sourceFiles(`${SRC}app`).filter(
  (read) => read.file.startsWith(GROUP) && /(?:^|\/)page\.tsx$/.test(read.file)
);

/** `(owner)/cellar/page.tsx` answers on `/cellar`, and `(owner)/page.tsx` on `/`. */
function route(file: string): string {
  const segments = file.slice(GROUP.length).replace(/\/?page\.tsx$/, "");
  return segments === "" ? "/" : `/${segments}`;
}

/** A route with a `[param]` in it is opened from a screen, never from the navigation. */
const detail = (path: string) => path.includes("[");

describe("the map and the routes agree", () => {
  it("finds the screens it is about to check", () => {
    expect(gated.length).toBeGreaterThan(0);
    expect(DESTINATIONS.length).toBeGreaterThan(0);
  });

  // The half that keeps a later slice's line out until its screen is there.
  it("sends every destination to a screen that exists", () => {
    const routes = new Set(gated.map((read) => route(read.file)));
    expect(DESTINATIONS.map((d) => d.href).filter((href) => !routes.has(href))).toEqual([]);
  });

  it("carries a line for every screen in the group", () => {
    const linked = new Set(DESTINATIONS.map((d) => d.href));
    const unreachable = gated
      .map((read) => route(read.file))
      .filter((path) => !detail(path) && !linked.has(path));
    expect(unreachable).toEqual([]);
  });

  it("names each destination once", () => {
    const hrefs = DESTINATIONS.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has a drawing for every destination", () => {
    expect(DESTINATIONS.filter((d) => !isDrawn(d.href)).map((d) => d.href)).toEqual([]);
  });
});

describe("the phone", () => {
  it("carries the agreed five on the bar, and the two chores in the header", () => {
    expect(onTheBar().map((d) => d.label)).toEqual([
      "Diary",
      "Cellar",
      "Add",
      "Wishlist",
      "Palate",
    ]);
    expect(inTheHeader().map((d) => d.label)).toEqual(["To check", "Settings"]);
  });

  it("puts every destination on the bar or in the header, once", () => {
    const placed = [...onTheBar(), ...inTheHeader()].map((d) => d.href).sort();
    expect(placed).toEqual(DESTINATIONS.map((d) => d.href).sort());
  });

  // The decision S6 and S7 slot into: Diary, Cellar, the round Add, Wishlist, Palate.
  it("puts the act in the middle of the bar once there is one", () => {
    const map: Destination[] = [
      { href: "/", label: "Diary", phone: "bar" },
      { href: "/cellar", label: "Cellar", phone: "bar" },
      { href: "/add", label: "Add", phone: "act" },
      { href: "/wishlist", label: "Wishlist", phone: "bar" },
      { href: "/palate", label: "Palate", phone: "bar" },
      { href: "/to-check", label: "To check", phone: "header" },
    ];
    expect(onTheBar(map).map((d) => d.label)).toEqual([
      "Diary",
      "Cellar",
      "Add",
      "Wishlist",
      "Palate",
    ]);
    expect(inTheHeader(map).map((d) => d.label)).toEqual(["To check"]);
  });
});

describe("where the owner is", () => {
  it.each([
    ["/", "/"],
    ["/cellar", "/cellar"],
    ["/cellar/", "/cellar"],
    ["/add", "/add"],
    ["/wishlist", "/wishlist"],
    ["/palate", "/palate"],
    ["/to-check", "/to-check"],
    ["/settings", "/settings"],
  ])("reads %s as %s", (pathname, expected) => {
    expect(currentDestination(pathname)).toBe(expected);
  });

  // A Label is reached from the diary, the Cellar and the to-check list alike.
  it("is nowhere on a Label's page, or outside the group", () => {
    expect(currentDestination("/labels/lbl_1")).toBeUndefined();
    expect(currentDestination("/signin")).toBeUndefined();
  });
});
