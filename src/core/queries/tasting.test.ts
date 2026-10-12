import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { recordTasting } from "../verbs/tasting.ts";
import { listTastings } from "./tasting.ts";

// Seam 1, against the real Postgres: `read_tastings`, filtered the ways spec §3 lists.
beforeEach(emptyTheCatalogue);

let barolo: string;
let chianti: string;
let whisky: string;
let loose: string;

beforeEach(async () => {
  const b = await aLabel({ vintage: 2019 });
  const c = await aLabel({
    producer: "Fattoria le Corti",
    name: "Le Corti Chianti Classico",
    region: "Toscana",
    appellation: "Chianti Classico",
    grapes: ["Sangiovese", "Colorino"],
    vintage: 2022,
  });
  const w = await aLabel({
    producer: "Lagavulin",
    name: "Lagavulin 16",
    kindId: "kind_whisky",
    region: "Islay",
    appellation: null,
    grapes: ["Barley"],
    vintage: undefined,
  });

  barolo = await recordTasting({ vintageId: b.vintageId, tastedOn: "2026-10-11", rating: 4 });
  chianti = await recordTasting({ vintageId: c.vintageId, tastedOn: "2026-06-01", rating: 3 });
  whisky = await recordTasting({ vintageId: w.vintageId, tastedOn: "2026-01-15", rating: 4.5 });
  loose = await recordTasting({
    description: "Sangiovese by the glass, Montalcino",
    tastedOn: "2026-08-20",
  });
});

const ids = async (filter: Parameters<typeof listTastings>[0]) =>
  (await listTastings(filter)).map((t) => t.id);

describe("reading the Tastings", () => {
  it("lists every Tasting, loose ones too, newest first, with what was drunk", async () => {
    const all = await listTastings();
    expect(all.map((t) => t.id)).toEqual([barolo, loose, chianti, whisky]);
    expect(all[0]).toMatchObject({
      rating: 4,
      description: null,
      vintage: { dating: "year", year: 2019 },
      label: {
        name: "Barolo Castiglione",
        kind: { id: "kind_red", name: "Red", section: "Wine" },
        appellation: "Barolo",
        silhouette: { shape: "bordeaux", liquid: "red", imageUrl: null },
      },
    });
    expect(all[1]).toMatchObject({
      description: "Sangiovese by the glass, Montalcino",
      vintage: null,
      label: null,
    });
  });

  // A loose Tasting has no Kind (ADR-0005), so a Kind filter does not see it.
  it("filters by Kind", async () => {
    expect(await ids({ kindId: "kind_whisky" })).toEqual([whisky]);
    expect(await ids({ kindId: "kind_red" })).toEqual([barolo, chianti]);
  });

  // The diary's chips: Wine, Spirits, and whatever section a Kind's row names. A loose
  // Tasting has no Kind, so it has no section either (ADR-0005).
  it("filters by section", async () => {
    expect(await ids({ section: "Wine" })).toEqual([barolo, chianti]);
    expect(await ids({ section: "Spirits" })).toEqual([whisky]);
    expect(await ids({ section: "Sake, beer and more" })).toEqual([]);
  });

  it("filters by region or appellation, accents and case folded", async () => {
    expect(await ids({ region: "chianti" })).toEqual([chianti]);
    expect(await ids({ region: "PIEMONTE" })).toEqual([barolo]);
    expect(await ids({ region: "montalcino" })).toEqual([loose]);
  });

  it("filters by grape, in a Label's grapes or a loose description", async () => {
    expect(await ids({ grape: "sangiovese" })).toEqual([loose, chianti]);
  });

  it("filters by a least Rating, leaving the unrated out", async () => {
    expect(await ids({ minRating: 4 })).toEqual([barolo, whisky]);
  });

  it("filters by a date range, both ends included", async () => {
    expect(await ids({ from: "2026-06-01", to: "2026-08-20" })).toEqual([loose, chianti]);
  });

  it("refuses a day that is not one, rather than failing in the driver", async () => {
    await expect(listTastings({ from: "2026-02-30" })).rejects.toMatchObject({ code: "invalid" });
    await expect(listTastings({ to: "last week" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("combines the filters", async () => {
    expect(await ids({ kindId: "kind_red", minRating: 3, from: "2026-07-01" })).toEqual([barolo]);
  });
});
