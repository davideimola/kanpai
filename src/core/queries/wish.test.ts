import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { addWish, closeWish } from "../verbs/wish.ts";
import { listOpenWishes } from "./wish.ts";

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
    const last = await addWish({ labelId: amarone.labelId, why: "for the holidays" });
    await closeWish(dropped, "dropped");

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
