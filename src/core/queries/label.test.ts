import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { addBottles } from "../verbs/bottle.ts";
import { markLabelVerified } from "../verbs/label.ts";
import { recordSource } from "../verbs/source.ts";
import { recordTasting } from "../verbs/tasting.ts";
import { ensureVintage } from "../verbs/vintage.ts";
import { getLabel, listUnverifiedLabels, searchLabels } from "./label.ts";

// Seam 1, against the real Postgres. The scores are derived and never stored (ADR-0003), so
// they are tested here, through the one question that answers them.
beforeEach(emptyTheCatalogue);

describe("one Label, whole", () => {
  it("carries its Vintages, their Bottles and Tastings, its Sources and every score", async () => {
    const { labelId, vintageId: v2019 } = await aLabel({ vintage: 2019, country: "Italy" });
    const v2016 = await ensureVintage(labelId, 2016);
    const unknown = await ensureVintage(labelId, "unknown");
    const [bottle] = await addBottles(v2019, 1);
    await recordTasting({ vintageId: v2019, tastedOn: "2025-01-10", rating: 5 });
    const latest2019 = await recordTasting({
      vintageId: v2019,
      tastedOn: "2026-09-01",
      rating: 3.5,
    });
    await recordTasting({ vintageId: v2016, tastedOn: "2024-03-01" });
    await recordTasting({ vintageId: unknown, tastedOn: "2026-10-01", rating: 2 });
    await recordSource(labelId, { source: "vivino", idAtSource: "9" });
    await recordSource(labelId, { source: "openfoodfacts", idAtSource: "800" });

    const label = await getLabel(labelId);

    expect(label).toMatchObject({
      id: labelId,
      producer: "Vietti",
      name: "Barolo Castiglione",
      kind: { id: "kind_red", name: "Red", section: "Wine", hasVintages: true },
      country: "Italy",
      region: "Piemonte",
      appellation: "Barolo",
      grapes: ["Nebbiolo"],
      ageStatement: null,
      strength: null,
      unverified: false,
      ownImageUrl: null,
      createdAt: expect.any(Date),
      // The unknown Vintage counts on the Label like any other (ADR-0010): its 2 is the
      // latest Rating, and the average is over all three rated Tastings.
      score: { latest: 2, average: 3.5, rated: 3 },
      sources: [{ source: "openfoodfacts" }, { source: "vivino" }],
    });
    // Years newest first, then NV, then unknown — each with its own score.
    expect(label?.vintages).toMatchObject([
      {
        id: v2019,
        dating: "year",
        year: 2019,
        score: { latest: 3.5, average: 4.25, rated: 2 },
        bottles: [{ id: bottle, state: "closed" }],
        tastings: [{ id: latest2019 }, { rating: 5 }],
      },
      { id: v2016, year: 2016, score: { latest: null, average: null, rated: 0 }, tastings: [{}] },
      { id: unknown, dating: "unknown", year: null, score: { latest: 2, average: 2, rated: 1 } },
    ]);
  });

  it("is null when no Label has that id", async () => {
    expect(await getLabel("lbl_missing")).toBeNull();
  });
});

describe("the Labels to check", () => {
  it("are the unverified ones, oldest first, until the owner marks them", async () => {
    const first = await aLabel({ name: "Sassicaia", unverified: true });
    await aLabel({ name: "Brolo Campofiorin", unverified: false });
    const second = await aLabel({ name: "Costasera Amarone", unverified: true });

    expect((await listUnverifiedLabels()).map((l) => l.id)).toEqual([
      first.labelId,
      second.labelId,
    ]);

    await markLabelVerified(first.labelId);
    expect(await listUnverifiedLabels()).toMatchObject([
      {
        id: second.labelId,
        name: "Costasera Amarone",
        kind: { id: "kind_red", name: "Red" },
        unverified: true,
      },
    ]);
  });
});

describe("searching our own Labels", () => {
  // From `docs/research/source-sample.md`: the owner's own Vivino history.
  beforeEach(async () => {
    await aLabel({
      producer: "Principe Corsini",
      name: "Sparkling Rosé",
      kindId: "kind_sparkling",
      vintage: "unknown",
    });
    await aLabel({
      producer: "Principe Corsini",
      name: "Don Tommaso Gran Selezione Chianti Classico",
      vintage: 2022,
    });
    await aLabel({
      producer: "Fattoria le Corti",
      name: "Le Corti Chianti Classico",
      vintage: 2024,
    });
    await aLabel({
      producer: "Martino Biscardo – L'Ornato",
      name: "Parziale Appassimento Rosso",
      vintage: 2022,
    });
    await aLabel({
      producer: "Biscardo",
      name: "Enigma Apassimento Sangiovese Rubicone",
      vintage: "unknown",
    });
    await aLabel({
      producer: "Guido Berlucchi",
      name: "Franciacorta Cuvée Imperiale Brut",
      kindId: "kind_sparkling",
      vintage: "nv",
    });
  });

  const names = async (term: string) => (await searchLabels(term)).map((l) => l.name);

  it("folds accents and case, so Rose finds Rosé and cuvee finds Cuvée", async () => {
    expect(await names("Rose")).toEqual(["Sparkling Rosé"]);
    expect(await names("CUVEE")).toEqual(["Franciacorta Cuvée Imperiale Brut"]);
  });

  // The same estate under two producer strings: neither spelling has to be the one typed.
  it("finds a Label by its name when the producer is written another way", async () => {
    const found = await searchLabels("Principe Corsini Le Corti");
    expect(found.map((l) => l.name)).toEqual([
      "Le Corti Chianti Classico",
      "Don Tommaso Gran Selezione Chianti Classico",
      "Sparkling Rosé",
    ]);
    expect(found[0]).toMatchObject({ producer: "Fattoria le Corti", matched: 2, ofWords: 4 });
  });

  it("puts the Label every word matches first, and the producer's others after", async () => {
    expect(await names("biscardo enigma")).toEqual([
      "Enigma Apassimento Sangiovese Rubicone",
      "Parziale Appassimento Rosso",
    ]);
  });

  it("matches the start of a word, not the middle of one", async () => {
    expect(await names("chian")).toHaveLength(2);
    expect(await names("anti")).toEqual([]);
  });

  it("finds nothing for nothing, and does not read the typed text as a pattern", async () => {
    expect(await searchLabels("   ")).toEqual([]);
    expect(await searchLabels("% _")).toEqual([]);
    expect(await names("L'Ornato")).toEqual(["Parziale Appassimento Rosso"]);
  });
});
