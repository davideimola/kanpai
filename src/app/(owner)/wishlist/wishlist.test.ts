import { describe, expect, it } from "vitest";
import { cameFromAsWritten, endedAsWritten, whichWishes } from "./wishlist";

// Pure functions over plain values: no database and no renderer, as the configuration's seams
// allow.

const TODAY = "2026-10-13";

describe("which Wishes are shown", () => {
  it("is the open ones unless the closed are asked for", () => {
    expect(whichWishes(undefined)).toBe("open");
    expect(whichWishes("closed")).toBe("closed");
    expect(whichWishes("anything")).toBe("open");
    expect(whichWishes(["closed", "closed"])).toBe("open");
  });
});

describe("how a Wish ended", () => {
  it("says the ending and the day, with the year only when it is not this one", () => {
    expect(endedAsWritten("bought", new Date("2026-10-12T18:00:00Z"), TODAY)).toBe(
      "Bought 12 October"
    );
    expect(endedAsWritten("dropped", new Date("2025-05-03T10:00:00Z"), TODAY)).toBe(
      "Dropped 3 May 2025"
    );
    expect(endedAsWritten("tasted", new Date("2026-01-02T10:00:00Z"), TODAY)).toBe(
      "Tasted 2 January"
    );
  });
});

describe("where a Wish came from", () => {
  it("says where the idea came from as it was written, then when it was added", () => {
    const at = new Date("2026-10-01T09:00:00Z");
    expect(cameFromAsWritten("The assistant", at, TODAY)).toBe("The assistant, added 1 October");
    expect(cameFromAsWritten(null, at, TODAY)).toBe("Added 1 October");
  });
});
