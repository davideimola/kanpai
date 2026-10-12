import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { addBottles, finishBottle, openBottle } from "../verbs/bottle.ts";
import { heldInTheCellar, readCellar } from "./cellar.ts";

// Seam 1, against the real Postgres. The Cellar is a view over the Bottles (ADR-0007): what
// is closed or open, by the heading the Kind's own row names.
beforeEach(emptyTheCatalogue);

describe("the Cellar", () => {
  it("is the Bottles not finished, under each Kind's section, open ones with their Level", async () => {
    const gin = await aLabel({
      producer: "Malfy",
      name: "Gin Rosa",
      kindId: "kind_gin",
      vintage: undefined,
    });
    const barolo = await aLabel({ vintage: 2019 });
    const prosecco = await aLabel({
      producer: "Montelliana",
      name: "Asolo Prosecco Superiore",
      kindId: "kind_sparkling",
      vintage: 2017,
    });

    const [openGin] = (await addBottles(gin.vintageId, 1)) as [string];
    await openBottle(openGin, { level: "1/4" });
    const [drunk, kept] = (await addBottles(barolo.vintageId, 2)) as [string, string];
    await finishBottle(drunk);
    const [bubbles] = (await addBottles(prosecco.vintageId, 1)) as [string];

    expect(await readCellar()).toEqual([
      {
        section: "Wine",
        bottles: [
          expect.objectContaining({
            id: kept,
            state: "closed",
            level: null,
            label: expect.objectContaining({
              name: "Barolo Castiglione",
              kind: { id: "kind_red", name: "Red" },
            }),
            vintage: expect.objectContaining({ dating: "year", year: 2019 }),
          }),
          expect.objectContaining({
            id: bubbles,
            label: expect.objectContaining({ kind: { id: "kind_sparkling", name: "Sparkling" } }),
          }),
        ],
      },
      {
        section: "Spirits",
        bottles: [
          expect.objectContaining({
            id: openGin,
            state: "open",
            level: "1/4",
            openedAt: expect.any(Date),
            vintage: expect.objectContaining({ dating: "nv" }),
          }),
        ],
      },
    ]);
  });

  it("is empty when every Bottle is finished", async () => {
    const { vintageId } = await aLabel();
    const [bottle] = (await addBottles(vintageId, 1)) as [string];
    await finishBottle(bottle);
    expect(await readCellar()).toEqual([]);
  });
});

describe("what the Cellar holds of some Labels", () => {
  it("is each Label's Bottles in the house by Vintage, newest year first, finished ones left out", async () => {
    const barolo = await aLabel({ vintage: 2019 });
    const [drunk] = (await addBottles(barolo.vintageId, 3)) as [string];
    await finishBottle(drunk);
    const [older] = (await addBottles({ labelId: barolo.labelId, dating: 2016 }, 1)) as [string];
    await openBottle(older, { level: "1/2" });
    await addBottles({ labelId: barolo.labelId, dating: "unknown" }, 1);
    const none = await aLabel({ producer: "Masi", name: "Costasera" });

    const held = await heldInTheCellar([barolo.labelId, none.labelId, "lbl_nobody"]);

    expect(held.get(barolo.labelId)).toEqual([
      { dating: "year", year: 2019, bottles: 2, open: 0 },
      { dating: "year", year: 2016, bottles: 1, open: 1 },
      { dating: "unknown", year: null, bottles: 1, open: 0 },
    ]);
    expect(held.get(none.labelId)).toEqual([]);
    expect(held.get("lbl_nobody")).toEqual([]);
  });

  it("asks nothing when there are no Labels", async () => {
    expect(await heldInTheCellar([])).toEqual(new Map());
  });
});
