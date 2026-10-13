import { describe, expect, it } from "vitest";
import { backFrom, backWith, tastingChangesFrom } from "./tastings";

// What a Tasting's edit panel says, and where its answer goes — pure, beside itself.

function aForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

const FILLED = {
  tastedOn: "2026-10-12",
  rating: "3,5",
  likedIt: " Yes ",
  bodyAndFeel: "",
  remindedOf: "",
  food: "Pizza",
  place: "",
  company: "",
  notes: "",
};

describe("what the edit panel says", () => {
  it("writes every field, clearing the empty ones and the Rating left Not rated", () => {
    expect(tastingChangesFrom(aForm(FILLED))).toEqual({
      tastedOn: "2026-10-12",
      rating: 3.5,
      likedIt: "Yes",
      bodyAndFeel: null,
      remindedOf: null,
      food: "Pizza",
      place: null,
      company: null,
      notes: null,
    });
    expect(tastingChangesFrom(aForm({ ...FILLED, rating: "" })).rating).toBeNull();
  });

  it("keeps a loose Tasting's description, and refuses it emptied", () => {
    expect(
      tastingChangesFrom(aForm({ ...FILLED, description: "Primitivo by the glass" })).description
    ).toBe("Primitivo by the glass");
    expect(() => tastingChangesFrom(aForm({ ...FILLED, description: " " }))).toThrow(
      "Say what you drank."
    );
  });

  it("refuses no day, and a Rating that is not one", () => {
    expect(() => tastingChangesFrom(aForm({ ...FILLED, tastedOn: "" }))).toThrow(
      "Choose the day you drank it."
    );
    expect(() => tastingChangesFrom(aForm({ ...FILLED, rating: "good" }))).toThrow(
      "Choose a rating from the list."
    );
  });
});

describe("where the answer goes", () => {
  it("goes back to a path on this host, and to the diary otherwise", () => {
    expect(backFrom("/labels/lbl_1")).toBe("/labels/lbl_1");
    expect(backFrom("/?view=wine&q=barolo")).toBe("/?view=wine&q=barolo");
    for (const elsewhere of [null, "", "https://example.com", "//example.com", "/\\example.com"]) {
      expect(backFrom(elsewhere)).toBe("/");
    }
    expect(backFrom("/labels/x\nSet-Cookie")).toBe("/");
  });

  it("keeps the page's own query, and drops what the last answer said", () => {
    expect(backWith("/?view=wine&q=barolo", { said: "tasting-deleted" })).toBe(
      "/?view=wine&q=barolo&said=tasting-deleted"
    );
    expect(
      backWith("/labels/lbl_1?panel=edit-tasting&tasting=tst_1&refused=No", { said: "x" })
    ).toBe("/labels/lbl_1?said=x");
    expect(backWith("/", { panel: "edit-tasting", tasting: "tst_1" })).toBe(
      "/?panel=edit-tasting&tasting=tst_1"
    );
  });
});
