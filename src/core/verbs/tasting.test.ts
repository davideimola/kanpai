import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { listTastings } from "../queries/tasting.ts";
import { attachTasting, editTasting, recordTasting, strikeTasting } from "./tasting.ts";

// Seam 1, against the real Postgres. A Tasting is on a Vintage or loose — exactly one
// (ADR-0005) — its Rating is one to five in halves (ADR-0003), and none overwrites another.
beforeEach(emptyTheCatalogue);

describe("recording a Tasting", () => {
  it("records on a Label's unknown Vintage when the year was not written down", async () => {
    const { labelId } = await aLabel({ vintage: 2019 });

    await recordTasting({ vintageOf: { labelId, dating: "unknown" }, rating: 3.5 });
    await recordTasting({ vintageOf: { labelId, dating: "unknown" }, rating: 4 });

    const vintages = (await getLabel(labelId))?.vintages ?? [];
    expect(vintages.map((v) => [v.dating, v.tastings.length])).toEqual([
      ["year", 0],
      ["unknown", 2],
    ]);
  });

  it("refuses naming the Vintage both ways", async () => {
    const { labelId, vintageId } = await aLabel();
    await expect(
      recordTasting({ vintageId, vintageOf: { labelId, dating: 2019 } })
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("leaves no new Vintage behind when the Tasting is refused", async () => {
    const { labelId } = await aLabel({ vintage: 2019 });
    await expect(
      recordTasting({ vintageOf: { labelId, dating: 2020 }, rating: 4.3 })
    ).rejects.toMatchObject({ constraint: "tastings_rating_is_one_to_five_in_halves" });
    expect((await getLabel(labelId))?.vintages.map((v) => v.year)).toEqual([2019]);
  });

  it("refuses a Label that does not exist", async () => {
    await expect(
      recordTasting({ vintageOf: { labelId: "lbl_missing", dating: 2019 } })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("records the occasion and the opinion on a Vintage", async () => {
    const { labelId, vintageId } = await aLabel();

    const id = await recordTasting({
      vintageId,
      tastedOn: "2026-10-11",
      place: "home",
      food: "steak",
      company: "Giulia",
      rating: 4,
      notes: "Dry in the mouth: that is the tannins.",
      likedIt: "Yes",
      bodyAndFeel: "Full, a bit dry",
      remindedOf: "Dark fruit",
    });

    expect(id).toMatch(/^tst_[0-9a-f]{24}$/);
    expect((await getLabel(labelId))?.vintages[0]?.tastings).toEqual([
      {
        id,
        tastedOn: "2026-10-11",
        place: "home",
        food: "steak",
        company: "Giulia",
        rating: 4,
        notes: "Dry in the mouth: that is the tannins.",
        likedIt: "Yes",
        bodyAndFeel: "Full, a bit dry",
        remindedOf: "Dark fruit",
      },
    ]);
  });

  it("records a loose Tasting with only a description, dated today and unrated", async () => {
    const id = await recordTasting({ description: "A Primitivo by the glass, house red" });

    const [loose] = await listTastings();
    expect(loose).toMatchObject({
      id,
      description: "A Primitivo by the glass, house red",
      rating: null,
      vintage: null,
      label: null,
    });
    expect(loose?.tastedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // The second may disagree with the first, and that is information for the sommelier.
  it("never overwrites an earlier Tasting of the same Vintage", async () => {
    const { labelId, vintageId } = await aLabel();
    await recordTasting({ vintageId, tastedOn: "2023-05-01", rating: 5 });
    await recordTasting({ vintageId, tastedOn: "2026-05-01", rating: 3 });

    expect((await getLabel(labelId))?.vintages[0]?.tastings.map((t) => t.rating)).toEqual([3, 5]);
  });

  it("refuses a Tasting both on a Vintage and described, or neither", async () => {
    const { vintageId } = await aLabel();
    await expect(recordTasting({ vintageId, description: "Barolo" })).rejects.toMatchObject({
      code: "invalid",
      constraint: "tastings_on_a_vintage_or_described",
    });
    await expect(recordTasting({ rating: 4 })).rejects.toMatchObject({
      code: "invalid",
      constraint: "tastings_on_a_vintage_or_described",
    });
  });

  it("takes a Rating in half steps from one to five, and refuses any other", async () => {
    const { vintageId } = await aLabel();
    await recordTasting({ vintageId, rating: 4.5 });
    await recordTasting({ vintageId, rating: 1 });

    for (const rating of [4.3, 0.5, 5.5, 0]) {
      await expect(recordTasting({ vintageId, rating })).rejects.toMatchObject({
        code: "invalid",
        constraint: "tastings_rating_is_one_to_five_in_halves",
      });
    }
  });

  it("refuses a day that is not one, and a Vintage that does not exist", async () => {
    await expect(recordTasting({ description: "x", tastedOn: "yesterday" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(recordTasting({ vintageId: "vtg_missing" })).rejects.toMatchObject({
      code: "not-found",
      constraint: "tastings_vintage_exists",
    });
  });
});

describe("the database, whoever writes to tastings", () => {
  it("refuses a blank description and padded company", async () => {
    await expect(query("insert into tastings (description) values ('   ')")).rejects.toMatchObject({
      constraint: "tastings_description_is_not_blank",
    });
    await expect(
      query("insert into tastings (description, company) values ('house red', ' Giulia')")
    ).rejects.toMatchObject({ constraint: "tastings_company_is_not_blank" });
  });
});

describe("editing a Tasting", () => {
  it("corrects what is given, clears what is null, and says when", async () => {
    const { vintageId } = await aLabel();
    const id = await recordTasting({ vintageId, rating: 4, place: "home", notes: "Good" });

    await editTasting(id, { rating: 3.5, place: null });

    const [edited] = await query<{
      rating: string;
      place: string | null;
      notes: string;
      edited_at: Date;
    }>("select rating, place, notes, edited_at from tastings where id = $1", [id]);
    expect(edited).toMatchObject({
      rating: "3.5",
      place: null,
      notes: "Good",
      edited_at: expect.any(Date),
    });
  });

  it("refuses a Rating out of range, and a Tasting that does not exist", async () => {
    const id = await recordTasting({ description: "house red" });
    await expect(editTasting(id, { rating: 6 })).rejects.toMatchObject({ code: "invalid" });
    await expect(editTasting("tst_missing", { rating: 3 })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("attaching a loose Tasting", () => {
  it("puts it on the Vintage, its description gone and the rest unchanged", async () => {
    const { labelId, vintageId } = await aLabel({
      name: "Primitivo di Manduria",
      vintage: undefined,
    });
    const id = await recordTasting({
      description: "A Primitivo by the glass",
      rating: 4,
      food: "orecchiette",
    });

    await attachTasting(id, vintageId);

    expect((await getLabel(labelId))?.vintages[0]?.tastings).toMatchObject([
      { id, rating: 4, food: "orecchiette" },
    ]);
    expect(await query("select description from tastings where id = $1", [id])).toEqual([
      { description: null },
    ]);
  });

  it("refuses a Tasting already on a Vintage, and one that does not exist", async () => {
    const { vintageId } = await aLabel();
    const id = await recordTasting({ vintageId });
    await expect(attachTasting(id, vintageId)).rejects.toMatchObject({ code: "not-allowed" });
    await expect(attachTasting("tst_missing", vintageId)).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("refuses a Vintage that does not exist", async () => {
    const id = await recordTasting({ description: "house red" });
    await expect(attachTasting(id, "vtg_missing")).rejects.toMatchObject({
      code: "not-found",
      constraint: "tastings_vintage_exists",
    });
  });
});

describe("striking a Tasting", () => {
  it("removes one entered by mistake, and no score counts it", async () => {
    const { labelId, vintageId } = await aLabel();
    await recordTasting({ vintageId, rating: 4 });
    const mistaken = await recordTasting({ vintageId, rating: 1 });

    await strikeTasting(mistaken);

    expect((await getLabel(labelId))?.score).toEqual({ latest: 4, average: 4, rated: 1 });
  });

  it("refuses a Tasting that does not exist", async () => {
    await expect(strikeTasting("tst_missing")).rejects.toMatchObject({ code: "not-found" });
  });
});
