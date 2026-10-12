import { afterEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listEveryKind, listKinds } from "./kind.ts";

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

// How each seeded Kind is drawn (ADR-0012, `0012`): a migration invariant, read back as the
// settings read it. Every copy starts from these until its owner redraws one.
describe("every Kind, as the settings keep them", () => {
  it("draws each seeded Kind in a shape and a liquid of its own, none hidden", async () => {
    const drawn = Object.fromEntries(
      (await listEveryKind()).map((kind) => [kind.id, `${kind.bottleShape} ${kind.liquid}`])
    );

    expect(drawn).toEqual({
      kind_red: "bordeaux red",
      kind_white: "burgundy white",
      kind_rose: "bordeaux rose",
      kind_orange: "burgundy orange",
      kind_sparkling: "flute white",
      kind_sweet: "burgundy white",
      kind_fortified: "bordeaux amber",
      kind_vermouth: "bordeaux amber",
      kind_whisky: "spirit amber",
      kind_rum: "spirit amber",
      kind_gin: "spirit clear",
      kind_vodka: "spirit clear",
      kind_tequila_mezcal: "spirit clear",
      kind_grappa: "spirit clear",
      kind_brandy: "spirit amber",
      kind_liqueur_amaro: "spirit amber",
      kind_other_spirit: "spirit amber",
      kind_sake: "sake clear",
      kind_beer: "beer amber",
      kind_cider: "beer white",
      kind_mead: "burgundy white",
    });
    expect((await listEveryKind()).filter((kind) => kind.hidden)).toEqual([]);
  });

  it("counts the Labels of each, so the settings know which may be deleted", async () => {
    await query("truncate wishes, tastings, bottles, label_sources, vintages, labels");
    expect((await listEveryKind()).every((kind) => kind.labels === 0)).toBe(true);
  });
});
