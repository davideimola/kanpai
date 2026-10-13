import { describe, expect, it } from "vitest";
import { isRefusal } from "@/core/refusal";
import {
  chosenAsParam,
  chosenFrom,
  firstVintage,
  nextStep,
  sourceSays,
  whatWasTyped,
} from "./search";

// Pure functions over plain values: no database and no renderer, as the configuration's seams
// allow. What they pin is how `/add` reads the one field, and what it says about each Source.

describe("what was typed into the search", () => {
  it("is a barcode when it is eight to fourteen digits, spaces between groups dropped", () => {
    expect(whatWasTyped("8002235012345")).toEqual({ barcode: "8002235012345" });
    expect(whatWasTyped(" 8 002235 012345 ")).toEqual({ barcode: "8002235012345" });
    expect(whatWasTyped("50103277")).toEqual({ barcode: "50103277" });
  });

  it("is words otherwise, a year among them included", () => {
    expect(whatWasTyped("  Costasera Masi ")).toEqual({ query: "Costasera Masi" });
    expect(whatWasTyped("2019")).toEqual({ query: "2019" });
    expect(whatWasTyped("Lagavulin 16")).toEqual({ query: "Lagavulin 16" });
  });
});

describe("what a Source says when it has no candidate", () => {
  const words = { query: "costasera" };

  it("says Vivino is not set up, and Open Food Facts is turned off, in one line each", () => {
    expect(sourceSays({ source: "vivino", state: "off", found: 0 }, words)).toBe(
      "Vivino is not set up on this copy."
    );
    expect(sourceSays({ source: "openfoodfacts", state: "off", found: 0 }, words)).toBe(
      "Open Food Facts is turned off on this copy."
    );
  });

  it("says a Source did not answer, never that the bottle does not exist (ADR-0011)", () => {
    expect(sourceSays({ source: "openfoodfacts", state: "unavailable", found: 0 }, words)).toBe(
      "Open Food Facts did not answer. Try again in a moment."
    );
  });

  it("says it found nothing by that name, or with that barcode", () => {
    expect(sourceSays({ source: "openfoodfacts", state: "consulted", found: 0 }, words)).toBe(
      "Nothing on Open Food Facts called “costasera”."
    );
    expect(
      sourceSays({ source: "openfoodfacts", state: "consulted", found: 0 }, { barcode: "123" })
    ).toBe("Nothing on Open Food Facts has that barcode.");
  });

  it("says nothing when it has candidates", () => {
    expect(sourceSays({ source: "vivino", state: "consulted", found: 2 }, words)).toBeNull();
  });
});

describe("a candidate in the address", () => {
  it("goes there and back", () => {
    const chosen = { source: "vivino", idAtSource: "21929" } as const;
    expect(chosenFrom(chosenAsParam(chosen))).toEqual(chosen);
    expect(chosenFrom("openfoodfacts:5010327755014")).toEqual({
      source: "openfoodfacts",
      idAtSource: "5010327755014",
    });
  });

  it("is nothing when the address names no Source this copy knows", () => {
    expect(chosenFrom(undefined)).toBeUndefined();
    expect(chosenFrom("21929")).toBeUndefined();
    expect(chosenFrom("wine-searcher:1")).toBeUndefined();
    expect(chosenFrom("vivino:")).toBeUndefined();
  });
});

describe("the first Vintage of a Label the owner makes (ADR-0010)", () => {
  const red = { name: "Red", hasVintages: true };
  const gin = { name: "Gin", hasVintages: false };

  it("is the year typed, whatever else was chosen", () => {
    expect(firstVintage({ kind: red, dating: "unknown", year: "2019" })).toBe(2019);
    expect(firstVintage({ kind: red, dating: "nv", year: " 2016 " })).toBe(2016);
  });

  it("is NV when the owner said No year, and unknown when they said nothing", () => {
    expect(firstVintage({ kind: red, dating: "nv", year: "" })).toBe("nv");
    expect(firstVintage({ kind: red, dating: "unknown", year: null })).toBe("unknown");
    expect(firstVintage({ kind: red, dating: null, year: null })).toBe("unknown");
  });

  it("is left to the verb for a Kind without vintages, which makes it NV", () => {
    expect(firstVintage({ kind: gin, dating: "unknown", year: "" })).toBeUndefined();
  });

  it("refuses a year that is not four figures, and a year on a Kind without vintages", () => {
    const refused = (said: Parameters<typeof firstVintage>[0]) => {
      try {
        firstVintage(said);
      } catch (error) {
        return isRefusal(error) ? error.message : "not a refusal";
      }
      return "not refused";
    };
    expect(refused({ kind: red, dating: null, year: "19" })).toBe(
      "Write the year as four figures, like 2019."
    );
    expect(refused({ kind: gin, dating: null, year: "2019" })).toBe(
      "A Gin has no year: its one Vintage is No year. Leave the year empty."
    );
  });
});

describe("where the owner goes next", () => {
  it("is the Tasting unless they chose Bottles or the wishlist", () => {
    expect(nextStep("bottles")).toBe("bottles");
    expect(nextStep("wish")).toBe("wish");
    expect(nextStep("taste")).toBe("taste");
    expect(nextStep("anything")).toBe("taste");
    expect(nextStep(null)).toBe("taste");
  });
});
