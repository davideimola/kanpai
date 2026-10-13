import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { listOpenWishes } from "../queries/wish.ts";
import { addWish, closeWish, reopenWish } from "./wish.ts";

// Seam 1, against the real Postgres. A Wish names a Label or a Vintage, and how it ended and
// when go together.
beforeEach(emptyTheCatalogue);

describe("adding a Wish", () => {
  it("names a Label, with why and where the idea came from", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({
      labelId,
      why: " To try with a roast ",
      cameFrom: "the assistant suggested it",
    });

    expect(id).toMatch(/^wish_[0-9a-f]{24}$/);
    expect(await listOpenWishes()).toMatchObject([
      {
        id,
        why: "To try with a roast",
        cameFrom: "the assistant suggested it",
        vintage: null,
        label: { id: labelId },
      },
    ]);
  });

  it("names one Vintage of a Label", async () => {
    const { labelId, vintageId } = await aLabel({ vintage: 2016 });
    await addWish({ vintageId });
    expect(await listOpenWishes()).toMatchObject([
      { label: { id: labelId }, vintage: { id: vintageId, dating: "year", year: 2016 } },
    ]);
  });

  it("refuses naming both, or neither", async () => {
    const { labelId, vintageId } = await aLabel();
    for (const wish of [{ labelId, vintageId }, { why: "something red" }]) {
      await expect(addWish(wish)).rejects.toMatchObject({
        code: "invalid",
        constraint: "wishes_name_a_label_or_a_vintage",
      });
    }
  });

  it("refuses a Label that does not exist", async () => {
    await expect(addWish({ labelId: "lbl_missing" })).rejects.toMatchObject({
      code: "not-found",
      constraint: "wishes_label_exists",
    });
  });
});

describe("closing a Wish", () => {
  it("records how it ended and when, and takes it off the wishlist", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({ labelId });
    const at = new Date("2026-10-12T18:00:00Z");

    await closeWish(id, "bought", { at });

    expect(await listOpenWishes()).toEqual([]);
    expect(await query("select closed_as, closed_at from wishes where id = $1", [id])).toEqual([
      { closed_as: "bought", closed_at: at },
    ]);
  });

  it("refuses closing twice, and a Wish that does not exist", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({ labelId });
    await closeWish(id, "dropped");
    await expect(closeWish(id, "tasted")).rejects.toMatchObject({ code: "not-allowed" });
    await expect(closeWish("wish_missing", "tasted")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("reopening a Wish", () => {
  it("undoes how it ended: it is open again, on the wishlist", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({ labelId, why: "for the holidays" });
    await closeWish(id, "dropped");

    await reopenWish(id);

    expect(await listOpenWishes()).toMatchObject([{ id, why: "for the holidays" }]);
    expect(await query("select closed_as, closed_at from wishes where id = $1", [id])).toEqual([
      { closed_as: null, closed_at: null },
    ]);
  });

  it("refuses a Wish still open, and one that does not exist", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({ labelId });
    await expect(reopenWish(id)).rejects.toMatchObject({ code: "not-allowed" });
    await expect(reopenWish("wish_missing")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("the database, whoever writes to wishes", () => {
  it("refuses an ending without its moment, and a moment without its ending", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({ labelId });
    await expect(
      query("update wishes set closed_as = 'bought' where id = $1", [id])
    ).rejects.toMatchObject({ constraint: "wishes_closed_as_and_closed_at_go_together" });
    await expect(
      query("update wishes set closed_at = now() where id = $1", [id])
    ).rejects.toMatchObject({ constraint: "wishes_closed_as_and_closed_at_go_together" });
  });

  it("refuses an ending it does not know", async () => {
    const { labelId } = await aLabel();
    const id = await addWish({ labelId });
    await expect(
      query("update wishes set closed_as = 'forgotten', closed_at = now() where id = $1", [id])
    ).rejects.toMatchObject({ constraint: "wishes_closed_as_is_known" });
  });
});
