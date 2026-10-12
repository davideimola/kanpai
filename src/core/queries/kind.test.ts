import { afterEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listKinds } from "./kind.ts";

// They are `CONTEXT.md`'s, read off the glossary rather than off the migration: if this test
// and the seed ever disagree, the glossary is the one that is right. The list grows by an
// insert, which is the whole of what ADR-0002 promised a new Kind would cost.
describe("the Kinds", () => {
  it("are the ones the glossary names, wines first, in the order they are offered in", async () => {
    expect(await listKinds()).toEqual([
      { id: "kind_red", name: "Red", family: "wine" },
      { id: "kind_white", name: "White", family: "wine" },
      { id: "kind_rose", name: "Rosé", family: "wine" },
      { id: "kind_sparkling", name: "Sparkling", family: "wine" },
      { id: "kind_sweet_fortified", name: "Sweet/fortified", family: "wine" },
      { id: "kind_whisky", name: "Whisky", family: "spirit" },
      { id: "kind_rum", name: "Rum", family: "spirit" },
      { id: "kind_gin", name: "Gin", family: "spirit" },
      { id: "kind_grappa", name: "Grappa", family: "spirit" },
      { id: "kind_brandy", name: "Brandy", family: "spirit" },
      { id: "kind_other_spirit", name: "Other spirit", family: "spirit" },
    ]);
  });

  // **A new Kind is a row, and nothing else** (ADR-0002). Taken out again afterwards, so the
  // vocabulary the other tests read is the seed's. It also says the id is minted when none is
  // given, prefixed like every other.
  describe("a Kind added later", () => {
    afterEach(async () => {
      await query("delete from kinds where name = 'Vermouth'");
    });

    it("is an insert, takes a prefixed id of its own, and is listed in its place", async () => {
      await query("insert into kinds (name, family, sort_order) values ('Vermouth', 'wine', 12)");
      const vermouth = (await listKinds()).at(-1);

      expect(vermouth).toMatchObject({ name: "Vermouth", family: "wine" });
      expect(vermouth?.id).toMatch(/^kind_[0-9a-f]{24}$/);
    });
  });

  // The one thing that is *not* data, and the database says so rather than this module
  // remembering it.
  it("refuses a family that is neither wine nor spirit", async () => {
    await expect(
      query("insert into kinds (name, family, sort_order) values ('Beer', 'beer', 99)")
    ).rejects.toThrow(/kinds_family_is_wine_or_spirit/);
  });
});
