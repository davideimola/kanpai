import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { addBottles, finishBottle, openBottle, setBottleLevel } from "./bottle.ts";

// Seam 1, against the real Postgres. A Bottle is closed, open or finished; only an open one
// has a Level; its dates follow its State; a finished one is kept (ADR-0007).
beforeEach(emptyTheCatalogue);

async function bottlesOf(labelId: string) {
  return (await getLabel(labelId))?.vintages.flatMap((v) => v.bottles) ?? [];
}

describe("adding Bottles", () => {
  it("puts n closed Bottles of a Vintage into the house, bought together", async () => {
    const { labelId, vintageId } = await aLabel();

    const ids = await addBottles(vintageId, 3, {
      boughtOn: "2026-10-01",
      price: "42,50",
      boughtWhere: " Enoteca Pinchiorri ",
    });

    expect(ids).toHaveLength(3);
    expect(ids[0]).toMatch(/^btl_[0-9a-f]{24}$/);
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect((await bottlesOf(labelId)).sort(byId)).toEqual(
      [...ids].sort().map((id) => ({
        id,
        state: "closed",
        level: null,
        boughtOn: "2026-10-01",
        price: "42.50",
        boughtWhere: "Enoteca Pinchiorri",
        openedAt: null,
        finishedAt: null,
      }))
    );
  });

  it("refuses no Bottles at all", async () => {
    const { vintageId } = await aLabel();
    await expect(addBottles(vintageId, 0)).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses a price that is not a number, and a day that is not one", async () => {
    const { vintageId } = await aLabel();
    await expect(addBottles(vintageId, 1, { price: "cheap" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(addBottles(vintageId, 1, { boughtOn: "2026-02-30" })).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("refuses a Vintage that does not exist", async () => {
    await expect(addBottles("vtg_missing", 1)).rejects.toMatchObject({
      code: "not-found",
      constraint: "bottles_vintage_exists",
    });
  });
});

describe("opening, levelling and finishing a Bottle", () => {
  it("opens a closed Bottle full, and then follows its Level down", async () => {
    const { labelId, vintageId } = await aLabel({ kindId: "kind_whisky", vintage: undefined });
    const [bottle] = (await addBottles(vintageId, 1)) as [string];

    await openBottle(bottle);
    expect(await bottlesOf(labelId)).toMatchObject([
      { state: "open", level: "full", openedAt: expect.any(Date) },
    ]);

    await setBottleLevel(bottle, "1/4");
    expect(await bottlesOf(labelId)).toMatchObject([{ state: "open", level: "1/4" }]);
  });

  it("opens one already half drunk when the owner says so", async () => {
    const { labelId, vintageId } = await aLabel();
    const [bottle] = (await addBottles(vintageId, 1)) as [string];
    await openBottle(bottle, { level: "1/2" });
    expect(await bottlesOf(labelId)).toMatchObject([{ level: "1/2" }]);
  });

  it("refuses opening a Bottle that is not closed", async () => {
    const { vintageId } = await aLabel();
    const [bottle] = (await addBottles(vintageId, 1)) as [string];
    await openBottle(bottle);
    await expect(openBottle(bottle)).rejects.toMatchObject({ code: "not-allowed" });
    await expect(openBottle("btl_missing")).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses a Level on a closed Bottle", async () => {
    const { vintageId } = await aLabel();
    const [bottle] = (await addBottles(vintageId, 1)) as [string];
    await expect(setBottleLevel(bottle, "3/4")).rejects.toMatchObject({
      code: "invalid",
      constraint: "bottles_level_only_when_open",
    });
  });

  it("finishes an open Bottle, which keeps it and drops its Level", async () => {
    const { labelId, vintageId } = await aLabel();
    const [bottle] = (await addBottles(vintageId, 1)) as [string];
    await openBottle(bottle, { at: new Date("2026-10-10T19:00:00Z") });

    await finishBottle(bottle, { at: new Date("2026-10-11T22:00:00Z") });

    expect(await bottlesOf(labelId)).toMatchObject([
      {
        state: "finished",
        level: null,
        openedAt: new Date("2026-10-10T19:00:00Z"),
        finishedAt: new Date("2026-10-11T22:00:00Z"),
      },
    ]);
  });

  // A wine opened and drunk the same evening is one press (ADR-0007).
  it("finishes a closed Bottle in one press, opened and finished at once", async () => {
    const { labelId, vintageId } = await aLabel();
    const [bottle] = (await addBottles(vintageId, 1)) as [string];

    await finishBottle(bottle);

    const [finished] = await bottlesOf(labelId);
    expect(finished?.state).toBe("finished");
    expect(finished?.openedAt).toEqual(finished?.finishedAt);
  });

  it("refuses finishing twice, and a finish before the opening", async () => {
    const { vintageId } = await aLabel();
    const [bottle, other] = (await addBottles(vintageId, 2)) as [string, string];
    await finishBottle(bottle);
    await expect(finishBottle(bottle)).rejects.toMatchObject({ code: "not-allowed" });

    await openBottle(other, { at: new Date("2026-10-10T19:00:00Z") });
    await expect(
      finishBottle(other, { at: new Date("2026-10-01T19:00:00Z") })
    ).rejects.toMatchObject({
      code: "invalid",
      constraint: "bottles_finished_after_opened",
    });
  });
});

describe("the database, whoever writes to bottles", () => {
  async function aBottle(): Promise<string> {
    const { vintageId } = await aLabel();
    return ((await addBottles(vintageId, 1)) as [string])[0];
  }

  it("refuses a State it does not know", async () => {
    const id = await aBottle();
    await expect(
      query(
        "update bottles set state = 'empty', opened_at = now(), finished_at = now() where id = $1",
        [id]
      )
    ).rejects.toMatchObject({ constraint: "bottles_state_is_known" });
  });

  it("refuses a Level finer than the four", async () => {
    const id = await aBottle();
    await expect(
      query("update bottles set state = 'open', opened_at = now(), level = '2/3' where id = $1", [
        id,
      ])
    ).rejects.toMatchObject({ constraint: "bottles_level_is_known" });
  });

  it("refuses an open Bottle without a Level", async () => {
    const id = await aBottle();
    await expect(
      query("update bottles set state = 'open', opened_at = now() where id = $1", [id])
    ).rejects.toMatchObject({ constraint: "bottles_level_only_when_open" });
  });

  it("refuses an open Bottle with no opening, and a closed one with a finish", async () => {
    const id = await aBottle();
    await expect(
      query("update bottles set state = 'open', level = 'full' where id = $1", [id])
    ).rejects.toMatchObject({ constraint: "bottles_dates_follow_the_state" });
    await expect(
      query("update bottles set finished_at = now() where id = $1", [id])
    ).rejects.toMatchObject({ constraint: "bottles_dates_follow_the_state" });
  });

  it("refuses deleting a finished Bottle, and lets a closed one added by mistake go", async () => {
    const finished = await aBottle();
    await finishBottle(finished);
    await expect(query("delete from bottles where id = $1", [finished])).rejects.toMatchObject({
      code: "23001",
      constraint: "bottles_finished_is_kept",
    });

    const mistaken = await aBottle();
    await query("delete from bottles where id = $1", [mistaken]);
    expect(await query("select id from bottles")).toEqual([{ id: finished }]);
  });
});
