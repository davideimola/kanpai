import { describe, expect, it } from "vitest";

import type { TastingEntry } from "@/core/queries/tasting";
import { byDay, theOccasion, whatWasDrunk, whatWasThought, whoMadeIt } from "./diary";

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
