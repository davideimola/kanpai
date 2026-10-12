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
      { id: "kind_orange", name: "Orange", section: "Wine", hasVintages: true },
      { id: "kind_sparkling", name: "Sparkling", section: "Wine", hasVintages: true },
      { id: "kind_sweet", name: "Sweet", section: "Wine", hasVintages: true },
      { id: "kind_fortified", name: "Fortified", section: "Wine", hasVintages: true },
      { id: "kind_vermouth", name: "Vermouth", section: "Wine", hasVintages: false },
      { id: "kind_whisky", name: "Whisky", section: "Spirits", hasVintages: false },
      { id: "kind_rum", name: "Rum", section: "Spirits", hasVintages: false },
      { id: "kind_gin", name: "Gin", section: "Spirits", hasVintages: false },
      { id: "kind_vodka", name: "Vodka", section: "Spirits", hasVintages: false },
      {
        id: "kind_tequila_mezcal",
        name: "Tequila and mezcal",
        section: "Spirits",
        hasVintages: false,
      },
      { id: "kind_grappa", name: "Grappa", section: "Spirits", hasVintages: false },
      { id: "kind_brandy", name: "Brandy", section: "Spirits", hasVintages: false },
      {
        id: "kind_liqueur_amaro",
        name: "Liqueur and amaro",
        section: "Spirits",
        hasVintages: false,
      },
      { id: "kind_other_spirit", name: "Other spirit", section: "Spirits", hasVintages: false },
      { id: "kind_sake", name: "Sake", section: "Sake, beer and more", hasVintages: false },
      { id: "kind_beer", name: "Beer", section: "Sake, beer and more", hasVintages: false },
      { id: "kind_cider", name: "Cider", section: "Sake, beer and more", hasVintages: false },
      { id: "kind_mead", name: "Mead", section: "Sake, beer and more", hasVintages: false },
    ]);
  });

  // **A new Kind is a row, and nothing else** (ADR-0002). Taken out again afterwards, so the
  // vocabulary the other tests read is the seed's. It also says the id is minted when none is
  // given, prefixed like every other.
  describe("a Kind added later", () => {
    afterEach(async () => {
      await query("delete from kinds where name = 'Kombucha'");
    });

    // Something the seed does not name, in a section of its own and with no years — what a
    // copy's owner adds from the settings. If it needed anything beyond the insert, ADR-0002's
    // promise would be broken.
    it("is an insert, takes a prefixed id of its own, and is listed in its place", async () => {
      await query(
        "insert into kinds (name, section, has_vintages, sort_order) values ('Kombucha', 'Ferments', false, 99)"
      );
      const kombucha = (await listKinds()).at(-1);

      expect(kombucha).toMatchObject({ name: "Kombucha", section: "Ferments", hasVintages: false });
      expect(kombucha?.id).toMatch(/^kind_[0-9a-f]{24}$/);
    });
  });

  // A section is a heading, so the database refuses one that would print as nothing.
  it("refuses a blank section", async () => {
    await expect(
      query(
        "insert into kinds (name, section, has_vintages, sort_order) values ('Kombucha', ' ', false, 99)"
      )
    ).rejects.toThrow(/kinds_section_is_not_blank/);
  });
});
