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

  // The diary's search (spec §4): what was drunk and what was said of it, word by word.
  describe("by what the owner typed", () => {
    it("finds a Tasting by its Label's name, producer, appellation, region, country and grapes", async () => {
      expect(await ids({ text: "castiglione" })).toEqual([barolo]);
      expect(await ids({ text: "VIETTI" })).toEqual([barolo]);
      expect(await ids({ text: "chianti classico" })).toEqual([chianti]);
      expect(await ids({ text: "islay" })).toEqual([whisky]);
      expect(await ids({ text: "colorino" })).toEqual([chianti]);
      const french = await aLabel({ name: "Sancerre", country: "France", vintage: 2022 });
      const there = await recordTasting({ vintageId: french.vintageId, tastedOn: "2026-05-01" });
      expect(await ids({ text: "france" })).toEqual([there]);
    });

    it("finds a Tasting by its Kind's name", async () => {
      expect(await ids({ text: "whisky" })).toEqual([whisky]);
      expect(await ids({ text: "red" })).toEqual([barolo, chianti]);
    });

    it("finds a loose Tasting by its description", async () => {
      expect(await ids({ text: "montalcino" })).toEqual([loose]);
      expect(await ids({ text: "sangiovese" })).toEqual([loose, chianti]);
    });

    it("finds a Tasting by its food, place, company, notes and guided answers", async () => {
      const etna = await aLabel({ name: "Etna Rosso", producer: "Benanti", vintage: 2021 });
      const said = await recordTasting({
        vintageId: etna.vintageId,
        tastedOn: "2026-09-01",
        food: "Grilled octopus",
        place: "Trattoria da Nino",
        company: "Giulia",
        notes: "Smoky, volcanic",
        likedIt: "Very much",
        bodyAndFeel: "Light and fresh",
        remindedOf: "Wild strawberries",
      });
      for (const word of ["octopus", "nino", "giulia", "volcanic", "much", "fresh", "strawberr"]) {
        expect(await ids({ text: word })).toEqual([said]);
      }
    });

    it("folds accents and case on both sides", async () => {
      const rose = await aLabel({
        producer: "Château d'Esclans",
        name: "Whispering Angel Rosé",
        kindId: "kind_rose",
        region: "Côtes de Provence",
        appellation: null,
        grapes: ["Grenache"],
        vintage: 2023,
      });
      const tasted = await recordTasting({ vintageId: rose.vintageId, tastedOn: "2026-07-01" });
      expect(await ids({ text: "rose chateau" })).toEqual([tasted]);
      expect(await ids({ text: "CÔTES" })).toEqual([tasted]);
    });

    // Narrowing: *barolo vietti* is the Barolo, not every Barolo and everything by Vietti.
    it("asks for every word, each at the start of a word", async () => {
      expect(await ids({ text: "barolo vietti" })).toEqual([barolo]);
      expect(await ids({ text: "barolo islay" })).toEqual([]);
      expect(await ids({ text: "olo" })).toEqual([]);
    });

    it("reads nothing typed, or only punctuation, as no search", async () => {
      expect(await ids({ text: "   " })).toHaveLength(4);
      expect(await ids({ text: "—!" })).toHaveLength(4);
    });

    it("combines with the section", async () => {
      expect(await ids({ text: "sangiovese", section: "Wine" })).toEqual([chianti]);
    });
  });
});
