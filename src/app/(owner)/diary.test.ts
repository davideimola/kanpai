import { describe, expect, it } from "vitest";

import type { TastingEntry } from "@/core/queries/tasting";
import {
  byDay,
  diaryAt,
  inTheCellar,
  madeAndKind,
  shownFrom,
  theOccasion,
  whatWasDrunk,
  whatWasThought,
  whenDrunk,
  whoMadeIt,
} from "./diary";

// The diary's reading of a Tasting, over plain entries shaped as `listTastings` answers.

function anEntry(overrides: Partial<TastingEntry> = {}): TastingEntry {
  return {
    id: "tst_1",
    tastedOn: "2026-10-10",
    place: null,
    food: null,
    company: null,
    rating: 4.5,
    notes: null,
    likedIt: null,
    bodyAndFeel: null,
    remindedOf: null,
    description: null,
    vintage: { id: "vtg_1", dating: "year", year: 2019 },
    label: {
      id: "lbl_1",
      producer: "Masi",
      name: "Costasera",
      kind: { id: "kind_red", name: "Red", section: "Wine" },
      region: "Veneto",
      appellation: "Amarone della Valpolicella Classico",
      silhouette: { shape: "bordeaux", liquid: "red", imageUrl: null },
    },
    ...overrides,
  };
}

describe("a Tasting in the diary", () => {
  it("is named by its Label, and made by its producer, appellation and year", () => {
    const entry = anEntry();
    expect(whatWasDrunk(entry)).toBe("Costasera");
    expect(whoMadeIt(entry)).toBe("Masi, Amarone della Valpolicella Classico, 2019");
  });

  it("falls back to the region, and says when a spirit has no year", () => {
    const entry = anEntry({
      vintage: { id: "vtg_2", dating: "nv", year: null },
      label: {
        ...(anEntry().label as NonNullable<TastingEntry["label"]>),
        producer: null,
        appellation: null,
        region: "Islay",
      },
    });
    expect(whoMadeIt(entry)).toBe("Islay, No year");
  });

  // ADR-0005: a Tasting that kept no Label is named by what was known of it.
  it("is named by its description when no Label was kept", () => {
    const entry = anEntry({
      label: null,
      vintage: null,
      description: "Primitivo by the glass\nat the trattoria",
    });
    expect(whatWasDrunk(entry)).toBe("Primitivo by the glass");
    expect(whoMadeIt(entry)).toBe("No label kept");
  });

  it("says what the owner thought, the guided answer first", () => {
    expect(whatWasThought(anEntry({ notes: "Notes", likedIt: "Loved it" }))).toBe("Loved it");
    expect(whatWasThought(anEntry({ notes: "Notes" }))).toBe("Notes");
    expect(whatWasThought(anEntry())).toBeNull();
  });

  it("says the occasion in one phrase, the food first", () => {
    expect(theOccasion({ food: "braised beef", place: "home", company: null })).toBe(
      "With braised beef, at home"
    );
    expect(theOccasion({ food: null, place: "a wine bar", company: "friends" })).toBe(
      "At a wine bar, with friends"
    );
    expect(theOccasion({ food: null, place: null, company: null })).toBeNull();
  });
});

describe("the days", () => {
  it("group the Tastings under the day they were drunk on, in the order given", () => {
    const days = byDay([
      anEntry({ id: "a", tastedOn: "2026-10-10" }),
      anEntry({ id: "b", tastedOn: "2026-10-10" }),
      anEntry({ id: "c", tastedOn: "2026-10-08" }),
    ]);
    expect(days.map((day) => [day.day, day.entries.map((e) => e.id)])).toEqual([
      ["2026-10-10", ["a", "b"]],
      ["2026-10-08", ["c"]],
    ]);
  });
});

describe("the address", () => {
  const sections = ["Wine", "Spirits"];

  it("reads the search, the section, the view and the order", () => {
    expect(
      shownFrom({ q: " barolo ", section: "Wine", view: "wine", sort: "rating" }, sections)
    ).toEqual({ q: "barolo", section: "Wine", view: "wine", sort: "rating" });
  });

  it("reads anything else as the plain diary", () => {
    expect(
      shownFrom({ q: "  ", section: "Beer", view: "shelf", sort: ["rating", "last"] }, sections)
    ).toEqual({ q: undefined, section: undefined, view: "day", sort: "last" });
  });

  it("changes one thing and keeps the rest, leaving the defaults out", () => {
    const shown = { q: "rosé", section: "Wine", view: "day", sort: "last" } as const;
    expect(diaryAt(shown)).toBe("/?q=ros%C3%A9&section=Wine");
    expect(diaryAt(shown, { view: "wine" })).toBe("/?q=ros%C3%A9&section=Wine&view=wine");
    expect(diaryAt(shown, { section: undefined })).toBe("/?q=ros%C3%A9");
    expect(diaryAt(shown, { q: undefined, section: undefined })).toBe("/");
  });

  // The order belongs to *By wine*: By day is always newest first.
  it("says the order only in By wine", () => {
    const wine = { view: "wine", sort: "rating" } as const;
    expect(diaryAt(wine)).toBe("/?view=wine&sort=rating");
    expect(diaryAt(wine, { view: "day" })).toBe("/");
    expect(diaryAt(wine, { sort: "last" })).toBe("/?view=wine");
  });
});

describe("a Label in By wine", () => {
  const today = "2026-10-13";
  const never = { tasted: 0, lastTastedOn: null, finished: 0, lastFinishedOn: null };

  it("says how often and when it was last tasted", () => {
    expect(whenDrunk({ ...never, tasted: 1, lastTastedOn: "2026-10-12" }, today)).toBe(
      "Tasted once, on 12 October"
    );
    expect(whenDrunk({ ...never, tasted: 2, lastTastedOn: "2026-10-12" }, today)).toBe(
      "Tasted twice, last on 12 October"
    );
    expect(whenDrunk({ ...never, tasted: 5, lastTastedOn: "2025-12-31", finished: 2 }, today)).toBe(
      "Tasted 5 times, last on 31 December 2025"
    );
  });

  // A bottle drunk with nothing recorded still says it was drunk.
  it("says when a bottle was finished with no Tasting recorded", () => {
    expect(whenDrunk({ ...never, finished: 1, lastFinishedOn: "2026-09-15" }, today)).toBe(
      "Finished on 15 September, no tasting recorded"
    );
    expect(whenDrunk({ ...never, finished: 3, lastFinishedOn: "2026-09-15" }, today)).toBe(
      "Three bottles finished, the last on 15 September, no tasting recorded"
    );
  });

  it("says what is left of it in the Cellar", () => {
    expect(
      inTheCellar([
        { dating: "year", year: 2019, bottles: 2, open: 1 },
        { dating: "nv", year: null, bottles: 1, open: 0 },
      ])
    ).toBe("In the Cellar: two bottles of 2019, one open. One bottle.");
  });

  it("says who made it and what it is", () => {
    const kind = { id: "kind_red", name: "Red", section: "Wine" };
    expect(madeAndKind({ producer: "Vietti", kind })).toBe("Vietti, Red");
    expect(madeAndKind({ producer: null, kind })).toBe("Red");
  });
});
