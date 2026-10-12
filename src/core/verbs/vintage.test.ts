import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { addBottles } from "./bottle.ts";
import { recordTasting } from "./tasting.ts";
import { ensureVintage, setVintageYear } from "./vintage.ts";
import { addWish } from "./wish.ts";

// Seam 1, against the real Postgres. A Vintage is a year, NV or unknown (ADR-0010), and every
// half of that sentence is a rule the database refuses to break by name.
beforeEach(emptyTheCatalogue);

describe("the database, whoever writes to vintages", () => {
  it("refuses a year on a Vintage that is not dated by year", async () => {
    const { labelId } = await aLabel();
    await expect(
      query("insert into vintages (label_id, dating, year) values ($1, 'nv', 2019)", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_year_is_there_exactly_when_dated_by_year" });
  });

  it("refuses a Vintage dated by year with no year", async () => {
    const { labelId } = await aLabel();
    await expect(
      query("insert into vintages (label_id, dating) values ($1, 'year')", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_year_is_there_exactly_when_dated_by_year" });
  });

  it("refuses a fourth way of being dated", async () => {
    const { labelId } = await aLabel();
    await expect(
      query("insert into vintages (label_id, dating) values ($1, 'uv')", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_dating_is_a_year_nv_or_unknown" });
  });

  it("refuses the same year twice on one Label", async () => {
    const { labelId } = await aLabel({ vintage: 2019 });
    await expect(
      query("insert into vintages (label_id, dating, year) values ($1, 'year', 2019)", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_one_per_year_per_label" });
  });

  it("refuses a second NV on one Label", async () => {
    const { labelId } = await aLabel({ vintage: "nv" });
    await expect(
      query("insert into vintages (label_id, dating) values ($1, 'nv')", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_one_nv_per_label" });
  });

  it("refuses a second unknown on one Label", async () => {
    const { labelId } = await aLabel({ vintage: "unknown" });
    await expect(
      query("insert into vintages (label_id, dating) values ($1, 'unknown')", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_one_unknown_per_label" });
  });

  it("allows the same year on two Labels", async () => {
    await aLabel({ vintage: 2019 });
    await aLabel({ name: "Barolo Rocche", vintage: 2019 });
    expect(await query("select 1 from vintages where year = 2019")).toHaveLength(2);
  });

  // The Kind carries the fact (ADR-0002): a whisky has its NV and nothing else.
  it("refuses an unknown on a Label whose Kind has no vintages", async () => {
    const { labelId } = await aLabel({ kindId: "kind_rum", vintage: undefined });
    await expect(
      query("insert into vintages (label_id, dating) values ($1, 'unknown')", [labelId])
    ).rejects.toMatchObject({ constraint: "vintages_of_a_kind_without_vintages_are_nv" });
  });

  it("refuses an implausible year", async () => {
    await expect(aLabel({ vintage: 19 })).rejects.toMatchObject({
      constraint: "vintages_year_is_plausible",
    });
  });
});

describe("ensuring a Vintage", () => {
  it("creates the year's Vintage the first time and finds it the second", async () => {
    const { labelId } = await aLabel({ vintage: 2019 });

    const created = await ensureVintage(labelId, 2016);
    expect(await ensureVintage(labelId, 2016)).toBe(created);
    expect((await getLabel(labelId))?.vintages.map((v) => v.year)).toEqual([2019, 2016]);
  });

  it("finds the one NV of a spirit rather than making a second", async () => {
    const { labelId, vintageId } = await aLabel({ kindId: "kind_gin", vintage: undefined });
    expect(await ensureVintage(labelId, "nv")).toBe(vintageId);
  });

  it("refuses a year on a spirit", async () => {
    const { labelId } = await aLabel({ kindId: "kind_gin", vintage: undefined });
    await expect(ensureVintage(labelId, 2020)).rejects.toMatchObject({
      code: "invalid",
      constraint: "vintages_of_a_kind_without_vintages_are_nv",
    });
  });

  it("refuses a Label that does not exist", async () => {
    await expect(ensureVintage("lbl_missing", 2020)).rejects.toMatchObject({
      code: "not-found",
      constraint: "vintages_label_exists",
    });
  });
});

describe("setting the year", () => {
  it("moves the chosen Bottles and Tastings to the year, creating it, and keeps the rest", async () => {
    const { labelId, vintageId: unknown } = await aLabel({ vintage: undefined });
    const [first, second] = await addBottles(unknown, 2);
    const tasted = await recordTasting({ vintageId: unknown, rating: 4 });

    const result = await setVintageYear({
      labelId,
      year: 2018,
      bottleIds: [first as string],
      tastingIds: [tasted],
    });

    expect(result).toMatchObject({ movedBottles: 1, movedTastings: 1, unknownRemains: true });
    expect((await getLabel(labelId))?.vintages).toMatchObject([
      { id: result.vintageId, year: 2018, bottles: [{ id: first }], tastings: [{ id: tasted }] },
      { id: unknown, dating: "unknown", bottles: [{ id: second }], tastings: [] },
    ]);
  });

  it("moves to a year's Vintage that is already there", async () => {
    const { labelId, vintageId: year } = await aLabel({ vintage: 2018 });
    const unknown = await ensureVintage(labelId, "unknown");
    await recordTasting({ vintageId: unknown });

    const result = await setVintageYear({ labelId, year: 2018 });

    expect(result).toEqual({
      vintageId: year,
      movedBottles: 0,
      movedTastings: 1,
      unknownRemains: false,
    });
  });

  it("moves everything, Wishes too, when nothing is named, and the empty unknown goes", async () => {
    const { labelId, vintageId: unknown } = await aLabel({ vintage: undefined });
    await addBottles(unknown, 1);
    await addWish({ vintageId: unknown });

    const result = await setVintageYear({ labelId, year: 2015 });

    expect(result).toMatchObject({ movedBottles: 1, movedTastings: 0, unknownRemains: false });
    expect((await getLabel(labelId))?.vintages).toMatchObject([{ year: 2015, bottles: [{}] }]);
    expect(await query("select vintage_id from wishes")).toEqual([
      { vintage_id: result.vintageId },
    ]);
  });

  it("refuses a Bottle that is not on the unknown Vintage, and moves nothing", async () => {
    const { labelId, vintageId: year } = await aLabel({ vintage: 2019 });
    const unknown = await ensureVintage(labelId, "unknown");
    const [elsewhere] = await addBottles(year, 1);
    const [waiting] = await addBottles(unknown, 1);

    await expect(
      setVintageYear({ labelId, year: 2017, bottleIds: [waiting as string, elsewhere as string] })
    ).rejects.toMatchObject({ code: "not-found" });
    expect((await getLabel(labelId))?.vintages.map((v) => v.year)).toEqual([2019, null]);
  });

  it("refuses a Label with no unknown Vintage", async () => {
    const { labelId } = await aLabel({ vintage: 2019 });
    await expect(setVintageYear({ labelId, year: 2017 })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
