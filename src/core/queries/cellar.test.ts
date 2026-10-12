import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { addBottles, finishBottle, openBottle } from "../verbs/bottle.ts";
import { readCellar } from "./cellar.ts";

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
