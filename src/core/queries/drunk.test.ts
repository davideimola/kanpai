import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { addBottles, finishBottle } from "../verbs/bottle.ts";
import { recordTasting } from "../verbs/tasting.ts";
import { listDrunk } from "./drunk.ts";

// Seam 1, against the real Postgres: the diary's *By wine* — each Label drunk, once.
beforeEach(emptyTheCatalogue);

let barolo: { labelId: string; vintageId: string };
let whisky: { labelId: string; vintageId: string };
let prosecco: { labelId: string; vintageId: string };
let neverDrunk: { labelId: string; vintageId: string };
let loose: string;
let looseRated: string;

beforeEach(async () => {
  barolo = await aLabel({ vintage: 2019 });
  whisky = await aLabel({
    producer: "Lagavulin",
    name: "Lagavulin 16",
    kindId: "kind_whisky",
    region: "Islay",
    appellation: null,
    grapes: ["Barley"],
    vintage: undefined,
  });
  prosecco = await aLabel({
    producer: "Montelliana",
    name: "Asolo Prosecco Superiore",
    kindId: "kind_sparkling",
    region: "Veneto",
    appellation: "Asolo",
    grapes: ["Glera"],
    vintage: 2017,
  });
  neverDrunk = await aLabel({ producer: "Gaja", name: "Sperss", vintage: 2016 });

  // The Barolo twice, the second time unrated: its last Rating is still the first one's.
  await recordTasting({
    vintageId: barolo.vintageId,
    tastedOn: "2026-09-01",
    rating: 3.5,
    food: "Braised beef",
  });
  await recordTasting({ vintageId: barolo.vintageId, tastedOn: "2026-10-10" });
  await recordTasting({ vintageId: whisky.vintageId, tastedOn: "2026-06-01", rating: 3 });
  await recordTasting({ vintageId: whisky.vintageId, tastedOn: "2026-08-01", rating: 4.5 });

  // The Prosecco was drunk and nobody recorded it: one Bottle finished, no Tasting.
  const [drunk] = (await addBottles(prosecco.vintageId, 2)) as [string];
  await finishBottle(drunk, { at: new Date("2026-09-15T20:00:00Z") });
  // The Sperss is in the house and nothing of it is drunk: not here.
  await addBottles(neverDrunk.vintageId, 1);

  loose = await recordTasting({
    description: "Primitivo by the glass\nSalento",
    tastedOn: "2026-10-01",
  });
  looseRated = await recordTasting({
    description: "House grappa",
    tastedOn: "2026-07-01",
    rating: 4,
  });
});

describe("what has been drunk, Label by Label", () => {
  it("lists each Label once, most recently drunk first, with its count and last Rating", async () => {
    const { labels } = await listDrunk();
    expect(labels.map((label) => label.id)).toEqual([
      barolo.labelId,
      prosecco.labelId,
      whisky.labelId,
    ]);
    expect(labels[0]).toMatchObject({
      name: "Barolo Castiglione",
      producer: "Vietti",
      kind: { id: "kind_red", name: "Red", section: "Wine" },
      silhouette: { shape: "bordeaux", liquid: "red", imageUrl: null },
      tasted: 2,
      lastTastedOn: "2026-10-10",
      lastRating: 3.5,
      finished: 0,
      lastFinishedOn: null,
    });
    expect(labels[2]).toMatchObject({ tasted: 2, lastTastedOn: "2026-08-01", lastRating: 4.5 });
  });

  // Otherwise a bottle drunk without a Tasting vanishes from every page.
  it("keeps a Label with a finished Bottle and no Tasting, by the day it was finished", async () => {
    const { labels } = await listDrunk();
    expect(labels.find((label) => label.id === prosecco.labelId)).toMatchObject({
      tasted: 0,
      lastTastedOn: null,
      lastRating: null,
      finished: 1,
      lastFinishedOn: "2026-09-15",
    });
  });

  it("leaves out a Label that was never drunk", async () => {
    const { labels } = await listDrunk();
    expect(labels.map((label) => label.id)).not.toContain(neverDrunk.labelId);
  });

  it("sorts by the last Rating, the unrated after", async () => {
    const { labels } = await listDrunk({ sort: "rating" });
    expect(labels.map((label) => label.id)).toEqual([
      whisky.labelId,
      barolo.labelId,
      prosecco.labelId,
    ]);
  });

  // ADR-0005: a loose Tasting is not a Label and is counted in none.
  it("gives the loose Tastings apart, newest first, or by Rating", async () => {
    expect((await listDrunk()).loose.map((entry) => entry.id)).toEqual([loose, looseRated]);
    expect((await listDrunk({ sort: "rating" })).loose.map((entry) => entry.id)).toEqual([
      looseRated,
      loose,
    ]);
  });

  it("filters by section, which leaves the loose Tastings out", async () => {
    const wine = await listDrunk({ section: "Wine" });
    expect(wine.labels.map((label) => label.id)).toEqual([barolo.labelId, prosecco.labelId]);
    expect(wine.loose).toEqual([]);
  });

  describe("searched", () => {
    it("finds a Label by its own words, accents and case folded", async () => {
      expect((await listDrunk({ text: "ISLAY" })).labels.map((label) => label.id)).toEqual([
        whisky.labelId,
      ]);
      expect((await listDrunk({ text: "glera" })).labels.map((label) => label.id)).toEqual([
        prosecco.labelId,
      ]);
      expect((await listDrunk({ text: "sparkling" })).labels.map((label) => label.id)).toEqual([
        prosecco.labelId,
      ]);
    });

    // What is found is the Label, whole: its counts are over all of its Tastings.
    it("finds a Label by what was said at one of its Tastings, and counts all of them", async () => {
      const { labels } = await listDrunk({ text: "braised" });
      expect(labels).toEqual([expect.objectContaining({ id: barolo.labelId, tasted: 2 })]);
    });

    it("finds the loose Tastings by their description", async () => {
      const found = await listDrunk({ text: "salento" });
      expect(found.labels).toEqual([]);
      expect(found.loose.map((entry) => entry.id)).toEqual([loose]);
    });

    it("finds nothing when a word matches nothing", async () => {
      expect(await listDrunk({ text: "barolo islay" })).toEqual({ labels: [], loose: [] });
    });
  });
});
