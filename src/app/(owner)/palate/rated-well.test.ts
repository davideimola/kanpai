import { describe, expect, it } from "vitest";
import { ratedWellInWords } from "./rated-well";

// Pure functions over plain values: no database and no renderer, as the configuration's seams
// allow.

const none = { atLeast: 4, tastings: 0, kinds: [], grapes: [], regions: [] };

describe("the aside beside the Palate", () => {
  it("says nothing with fewer than three Tastings rated well", () => {
    expect(ratedWellInWords(none)).toBeNull();
    expect(
      ratedWellInWords({ ...none, tastings: 2, kinds: [{ name: "Red", tastings: 2 }] })
    ).toBeNull();
  });

  it("counts each tally, leaving out what only one Tasting had, and a line left with nothing", () => {
    expect(
      ratedWellInWords({
        atLeast: 4,
        tastings: 7,
        kinds: [
          { name: "Red", tastings: 5 },
          { name: "Gin", tastings: 2 },
        ],
        grapes: [
          { name: "Nebbiolo", tastings: 3 },
          { name: "Barbera", tastings: 1 },
        ],
        regions: [{ name: "Piemonte", tastings: 1 }],
      })
    ).toEqual({
      heading: "Of the 7 Tastings you rated 4 or more:",
      lines: [
        { name: "Kinds", said: "Red (5), Gin (2)" },
        { name: "Grapes", said: "Nebbiolo (3)" },
      ],
    });
  });

  it("says nothing when the Tastings rated well share nothing", () => {
    expect(
      ratedWellInWords({
        ...none,
        tastings: 3,
        kinds: [
          { name: "Gin", tastings: 1 },
          { name: "Red", tastings: 1 },
          { name: "Sake", tastings: 1 },
        ],
      })
    ).toBeNull();
  });

  it("writes a half as the owner reads it", () => {
    expect(
      ratedWellInWords({
        ...none,
        atLeast: 4.5,
        tastings: 3,
        kinds: [{ name: "Red", tastings: 3 }],
      })?.heading
    ).toBe("Of the 3 Tastings you rated 4½ or more:");
  });
});
