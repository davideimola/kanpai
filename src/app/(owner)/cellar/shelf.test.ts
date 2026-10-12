import { describe, expect, it } from "vitest";

import type { CellarBottle, CellarSection } from "@/core/queries/cellar";
import { chips, shelves, showFrom, showParam, tally } from "./shelf";

// The Cellar laid out as shelves, over plain data shaped as `readCellar` answers.

function aBottle(
  id: string,
  vintageId: string,
  name: string,
  open?: CellarBottle["level"]
): CellarBottle {
  return {
    id,
    state: open ? "open" : "closed",
    level: open ?? null,
    openedAt: open ? new Date() : null,
    boughtOn: null,
    vintage: { id: vintageId, dating: "year", year: 2019 },
    label: {
      id: `lbl_${name}`,
      producer: null,
      name,
      kind: { id: "kind_red", name: "Red" },
      region: null,
      appellation: null,
      silhouette: { shape: "bordeaux", liquid: "red", imageUrl: null },
    },
  };
}

const CELLAR: CellarSection[] = [
  {
    section: "Wine",
    bottles: [
      aBottle("b1", "v1", "Costasera", "1/2"),
      aBottle("b2", "v1", "Costasera"),
      aBottle("b3", "v2", "Barolo"),
      aBottle("b4", "v2", "Barolo"),
    ],
  },
  { section: "Spirits", bottles: [aBottle("b5", "v3", "Hedonya", "3/4")] },
];

describe("the shelves", () => {
  it("are one per section, an open Bottle on its own, closed ones of a Vintage together", () => {
    expect(
      shelves(CELLAR, { what: "everything" }).map((shelf) => ({
        section: shelf.section,
        items: shelf.items.map((item) => [item.label.name, item.level, item.count]),
      }))
    ).toEqual([
      {
        section: "Wine",
        items: [
          ["Costasera", "1/2", 1],
          ["Costasera", null, 1],
          ["Barolo", null, 2],
        ],
      },
      { section: "Spirits", items: [["Hedonya", "3/4", 1]] },
    ]);
  });

  it("show only the open Bottles, or one section, when asked", () => {
    expect(
      shelves(CELLAR, { what: "open" }).flatMap((shelf) => shelf.items.map((i) => i.key))
    ).toEqual(["b1", "b5"]);
    expect(shelves(CELLAR, { what: "section", section: "Spirits" }).map((s) => s.section)).toEqual([
      "Spirits",
    ]);
  });
});

describe("the chips", () => {
  it("count everything, the open ones, and every section the Kinds name, empty ones too", () => {
    expect(chips(CELLAR, ["Wine", "Spirits", "Sake, beer and more"])).toEqual([
      { show: { what: "everything" }, label: "Everything", count: 5 },
      { show: { what: "open" }, label: "Open", count: 2 },
      { show: { what: "section", section: "Wine" }, label: "Wine", count: 4 },
      { show: { what: "section", section: "Spirits" }, label: "Spirits", count: 1 },
      {
        show: { what: "section", section: "Sake, beer and more" },
        label: "Sake, beer and more",
        count: 0,
      },
    ]);
    expect(tally(CELLAR)).toEqual({ bottles: 5, open: 2 });
  });

  it("read `?show=` against what there is, anything else being everything", () => {
    expect(showFrom("open", ["Wine"])).toEqual({ what: "open" });
    expect(showFrom("Wine", ["Wine"])).toEqual({ what: "section", section: "Wine" });
    expect(showFrom("Beer", ["Wine"])).toEqual({ what: "everything" });
    expect(showParam({ what: "everything" })).toBeUndefined();
  });
});
