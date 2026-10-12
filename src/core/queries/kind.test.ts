import { afterEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listKinds } from "./kind.ts";

// They are `CONTEXT.md`'s, read off the glossary rather than off the migration: if this test
// and the seed ever disagree, the glossary is the one that is right. The list grows by an
// insert, which is the whole of what ADR-0002 promised a new Kind would cost.
describe("the Kinds", () => {
  it("are the ones the glossary names, wines first, in the order they are offered in", async () => {
    expect(await listKinds()).toEqual([
      { id: "kind_red", name: "Red", section: "Wine", hasVintages: true },
      { id: "kind_white", name: "White", section: "Wine", hasVintages: true },
      { id: "kind_rose", name: "Rosé", section: "Wine", hasVintages: true },
      { id: "kind_sparkling", name: "Sparkling", section: "Wine", hasVintages: true },
      { id: "kind_sweet_fortified", name: "Sweet/fortified", section: "Wine", hasVintages: true },
      { id: "kind_whisky", name: "Whisky", section: "Spirits", hasVintages: false },
      { id: "kind_rum", name: "Rum", section: "Spirits", hasVintages: false },
      { id: "kind_gin", name: "Gin", section: "Spirits", hasVintages: false },
      { id: "kind_grappa", name: "Grappa", section: "Spirits", hasVintages: false },
      { id: "kind_brandy", name: "Brandy", section: "Spirits", hasVintages: false },
      { id: "kind_other_spirit", name: "Other spirit", section: "Spirits", hasVintages: false },
    ]);
  });

  // **A new Kind is a row, and nothing else** (ADR-0002). Taken out again afterwards, so the
  // vocabulary the other tests read is the seed's. It also says the id is minted when none is
  // given, prefixed like every other.
  describe("a Kind added later", () => {
    afterEach(async () => {
      await query("delete from kinds where name = 'Beer'");
    });

    // A beer is the case ADR-0002 named: neither wine nor spirit, a section of its own and no
    // years. If it needed anything beyond the insert, that promise would be broken.
    it("is an insert, takes a prefixed id of its own, and is listed in its place", async () => {
      await query(
        "insert into kinds (name, section, has_vintages, sort_order) values ('Beer', 'Beer', false, 12)"
      );
      const beer = (await listKinds()).at(-1);

      expect(beer).toMatchObject({ name: "Beer", section: "Beer", hasVintages: false });
      expect(beer?.id).toMatch(/^kind_[0-9a-f]{24}$/);
    });
  });

  // A section is a heading, so the database refuses one that would print as nothing.
  it("refuses a blank section", async () => {
    await expect(
      query(
        "insert into kinds (name, section, has_vintages, sort_order) values ('Beer', ' ', false, 99)"
      )
    ).rejects.toThrow(/kinds_section_is_not_blank/);
  });
});
