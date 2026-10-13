import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { addWish, closeWish } from "../verbs/wish.ts";
import { getWish, listOpenWishes, listWishes, openWishOn } from "./wish.ts";

// Seam 1, against the real Postgres: the wishlist.
beforeEach(emptyTheCatalogue);

describe("the open Wishes", () => {
  it("are the ones not closed, newest first, each with its Label", async () => {
    const sassicaia = await aLabel({
      producer: "Tenuta San Guido",
      name: "Sassicaia",
      vintage: 2005,
    });
    const amarone = await aLabel({ producer: "Masi", name: "Costasera Amarone", vintage: 2004 });
    const first = await addWish({ vintageId: sassicaia.vintageId, cameFrom: "a friend" });
    const dropped = await addWish({ labelId: amarone.labelId });
    await closeWish(dropped, "dropped");
    const last = await addWish({ labelId: amarone.labelId, why: "for the holidays" });

    expect(await listOpenWishes()).toEqual([
      {
        id: last,
        why: "for the holidays",
        cameFrom: null,
        createdAt: expect.any(Date),
        label: {
          id: amarone.labelId,
          producer: "Masi",
          name: "Costasera Amarone",
          kind: { id: "kind_red", name: "Red" },
        },
        vintage: null,
      },
      {
        id: first,
        why: null,
        cameFrom: "a friend",
        createdAt: expect.any(Date),
        label: {
          id: sassicaia.labelId,
          producer: "Tenuta San Guido",
          name: "Sassicaia",
          kind: { id: "kind_red", name: "Red" },
        },
        vintage: { id: sassicaia.vintageId, dating: "year", year: 2005 },
      },
    ]);
  });
});

describe("the wishlist page", () => {
  it("lists the open Wishes newest first, each Label drawn", async () => {
    const etna = await aLabel({ producer: "Benanti", name: "Etna Rosso" });
    const gin = await aLabel({
      producer: "Malfy",
      name: "Malfy Gin",
      kindId: "kind_gin",
      vintage: undefined,
    });
    const first = await addWish({ labelId: etna.labelId, why: "lighter than an Amarone" });
    const last = await addWish({ vintageId: gin.vintageId, cameFrom: "a friend" });

    expect(await listWishes("open")).toEqual([
      expect.objectContaining({
        id: last,
        closedAs: null,
        closedAt: null,
        vintage: { id: gin.vintageId, dating: "nv", year: null },
        label: expect.objectContaining({
          id: gin.labelId,
          silhouette: { shape: "spirit", liquid: "clear", imageUrl: null },
        }),
      }),
      expect.objectContaining({
        id: first,
        why: "lighter than an Amarone",
        label: expect.objectContaining({
          name: "Etna Rosso",
          kind: { id: "kind_red", name: "Red" },
          silhouette: { shape: "bordeaux", liquid: "red", imageUrl: null },
        }),
      }),
    ]);
    expect(await listWishes("closed")).toEqual([]);
  });

  it("lists the closed ones apart, the most recently closed first, with how each ended", async () => {
    const { labelId } = await aLabel();
    const bought = await addWish({ labelId });
    await closeWish(bought, "bought", { at: new Date("2026-10-01T18:00:00Z") });
    const dropped = await addWish({ labelId });
    await closeWish(dropped, "dropped", { at: new Date("2026-10-05T18:00:00Z") });
    const open = await addWish({ labelId });

    expect(await listWishes("closed")).toMatchObject([
      { id: dropped, closedAs: "dropped", closedAt: new Date("2026-10-05T18:00:00Z") },
      { id: bought, closedAs: "bought", closedAt: new Date("2026-10-01T18:00:00Z") },
    ]);
    expect((await listWishes("open")).map((wish) => wish.id)).toEqual([open]);
  });
});

describe("one Wish", () => {
  it("is found by its id with the Label it names, through its Vintage too", async () => {
    const { labelId, vintageId } = await aLabel({ vintage: 2016 });
    const id = await addWish({ vintageId });
    await closeWish(id, "tasted");
    expect(await getWish(id)).toEqual({ id, labelId, vintageId, closedAs: "tasted" });
    expect(await getWish("wish_missing")).toBeNull();
  });
});

describe("the open Wish on a Label", () => {
  it("is the one naming the Label or one of its Vintages, and none once it is closed", async () => {
    const { labelId, vintageId } = await aLabel({ vintage: 2016 });
    const other = await aLabel({ name: "Barolo Rocche" });
    expect(await openWishOn(labelId)).toBeNull();

    const id = await addWish({ vintageId, why: "the 2016 above all" });
    expect(await openWishOn(labelId)).toEqual({
      id,
      why: "the 2016 above all",
      createdAt: expect.any(Date),
      vintage: { id: vintageId, dating: "year", year: 2016 },
    });
    expect(await openWishOn(other.labelId)).toBeNull();

    await closeWish(id, "bought");
    expect(await openWishOn(labelId)).toBeNull();
  });
});
