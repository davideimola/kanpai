import { describe, expect, it } from "vitest";

import {
  bottlesInWords,
  counted,
  dateAsWritten,
  dayAsWritten,
  heldInWords,
  levelAsWritten,
  openAsWritten,
  tastedTimes,
  vintageAsWritten,
} from "./words";

// Pure functions over plain values: no database and no renderer, as the configuration's
// seams allow. What they pin is what the owner reads on every screen.

describe("a Vintage, as written", () => {
  it("is its year, and never says NV for a year nobody wrote down (ADR-0010)", () => {
    expect(vintageAsWritten({ dating: "year", year: 2019 })).toBe("2019");
    expect(vintageAsWritten({ dating: "nv", year: null })).toBe("No year");
    expect(vintageAsWritten({ dating: "unknown", year: null })).toBe("Year unknown");
  });
});

describe("a Level, as written", () => {
  it("is what is left, in fractions an eye can judge", () => {
    expect(levelAsWritten("full")).toBe("full");
    expect(levelAsWritten("1/2")).toBe("½ left");
    expect(openAsWritten("3/4")).toBe("Open, ¾ left");
  });
});

describe("a Vintage's Bottles, in a sentence", () => {
  it("says the open one with what is left, then the closed ones", () => {
    expect(
      bottlesInWords([
        { state: "open", level: "1/2" },
        { state: "closed", level: null },
      ])
    ).toBe("One open, half left. One closed.");
  });

  it("counts several, and says when nothing is left in the house", () => {
    expect(
      bottlesInWords([
        { state: "closed", level: null },
        { state: "closed", level: null },
      ])
    ).toBe("Two closed.");
    expect(bottlesInWords([{ state: "finished", level: null }])).toBe("None left in the house.");
    expect(bottlesInWords([])).toBe("No bottles in the house.");
  });
});

describe("what the Cellar holds of a Label, in a sentence", () => {
  it("says the bottles of each year, and which are open", () => {
    expect(heldInWords([{ dating: "year", year: 2019, bottles: 2, open: 0 }])).toBe(
      "Two bottles of 2019."
    );
    expect(
      heldInWords([
        { dating: "year", year: 2019, bottles: 3, open: 1 },
        { dating: "year", year: 2016, bottles: 1, open: 1 },
      ])
    ).toBe("Three bottles of 2019, one open. One bottle of 2016, open.");
  });

  it("names no year for NV, and says when the year is unknown (ADR-0010)", () => {
    expect(heldInWords([{ dating: "nv", year: null, bottles: 2, open: 2 }])).toBe(
      "Two bottles, all open."
    );
    expect(heldInWords([{ dating: "unknown", year: null, bottles: 1, open: 0 }])).toBe(
      "One bottle, year unknown."
    );
  });

  it("says so when none is in the house", () => {
    expect(heldInWords([])).toBe("None in the Cellar.");
  });
});

describe("counts", () => {
  it("are singular for one", () => {
    expect(counted(1, "bottle")).toBe("1 bottle");
    expect(counted(15, "bottle")).toBe("15 bottles");
    expect(tastedTimes(0)).toBe("Not tasted yet");
    expect(tastedTimes(2)).toBe("Tasted twice");
    expect(tastedTimes(4)).toBe("Tasted 4 times");
  });
});

describe("a day, as a heading", () => {
  it("names the weekday, and the year only when it is not this one", () => {
    expect(dayAsWritten("2026-10-10", "2026-10-12")).toBe("Saturday 10 October");
    expect(dayAsWritten("2025-02-14", "2026-10-12")).toBe("Friday 14 February 2025");
  });

  it("writes a moment as a short date", () => {
    expect(dateAsWritten(new Date("2026-10-12T21:00:00Z"), "2026-10-12")).toBe("12 October");
    expect(dateAsWritten(new Date("2025-03-01T08:00:00Z"), "2026-10-12")).toBe("1 March 2025");
  });
});
