import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { type Asked, answering, timedOut } from "@/test/sources";
import type { Sources } from "../sources/candidate.ts";
import { openFoodFacts } from "../sources/openfoodfacts.ts";
import { vivino } from "../sources/vivino.ts";
import { recordSource } from "../verbs/source.ts";
import { searchCatalogue } from "./catalogue.ts";

// Seam 1: our Labels from the real Postgres, the Sources from recordings (`src/test/sources.ts`).
// What is under test is the question — which Sources are asked, in which order, what is
// discarded, and what a Source that does not answer does to the answer (ADR-0011).

beforeEach(emptyTheCatalogue);

const ACCESS = { appId: "9TAKGWJUXL", key: "a-stand-in-for-the-key" };

/** Both Sources, answering each request from `answer`, and what each was asked. */
function bothSources(answer: (asked: Asked, source: "openfoodfacts" | "vivino") => string | Error) {
  const offFetch = answering((asked) => answer(asked, "openfoodfacts"));
  const vivinoFetch = answering((asked) => answer(asked, "vivino"));
  const sources: Sources = {
    openfoodfacts: openFoodFacts(offFetch),
    vivino: vivino(ACCESS, vivinoFetch),
  };
  return { sources, offAsked: offFetch.asked, vivinoAsked: vivinoFetch.asked };
}

const HENDRICKS = (_: Asked, source: "openfoodfacts" | "vivino") =>
  source === "vivino"
    ? "vivino-search-hendricks-gin.json"
    : "openfoodfacts-search-hendricks-gin.json";

describe("searching the catalogue", () => {
  it("answers with our Labels first, then the Sources' candidates, and says who was asked", async () => {
    await aLabel({ producer: "Masi", name: "Costasera", kindId: "kind_red", vintage: 2015 });
    const { sources } = bothSources((_, source) =>
      source === "vivino"
        ? "vivino-search-masi-costasera.json"
        : "openfoodfacts-search-hedonya-gin.json"
    );

    const answer = await searchCatalogue(sources, { query: "Masi Costasera", kind: "kind_red" });

    expect(answer.labels.map((one) => one.name)).toEqual(["Costasera"]);
    expect(answer.candidates[0]).toMatchObject({
      source: "vivino",
      idAtSource: "21929",
      label: null,
    });
    expect(answer.sources).toEqual([
      { source: "vivino", state: "consulted", found: 3 },
      { source: "openfoodfacts", state: "consulted", found: 0 },
    ]);
  });

  // The Hedonya Gin case (`docs/research/sources.md` §9b'): a craft gin no Source knows, and
  // both answering with Hendrick's, Tanqueray and Gin Mare on the word *gin* alone.
  it("discards every candidate that shares no word with the producer: Hedonya is not Hendrick's", async () => {
    const { sources } = bothSources((_, source) =>
      source === "vivino"
        ? "vivino-search-hedonya-gin.json"
        : "openfoodfacts-search-hedonya-gin.json"
    );

    const answer = await searchCatalogue(sources, { query: "Hedonya Gin", kind: "kind_gin" });

    expect(answer.candidates).toEqual([]);
    expect(answer.discarded).toBeGreaterThan(5);
    expect(answer.sources.map((one) => one.state)).toEqual(["consulted", "consulted"]);
  });

  it("filters on the producer when it is sent apart from the name", async () => {
    const { sources } = bothSources((_, source) =>
      source === "vivino"
        ? "vivino-search-masi-costasera.json"
        : "openfoodfacts-search-hedonya-gin.json"
    );

    const answer = await searchCatalogue(sources, {
      producer: "Masi",
      query: "Costasera",
      kind: "kind_red",
    });

    // Mas Viña Costera's rosados share neither *Masi* nor a word long enough to stand for it.
    expect(answer.candidates.map((one) => one.producer)).toEqual(["Masi", "Masi", "Masi"]);
  });

  it("asks Vivino first for a wine, and Open Food Facts first for a gin", async () => {
    const wine = await searchCatalogue(bothSources(HENDRICKS).sources, {
      query: "Hendrick's gin",
      kind: "kind_red",
    });
    expect(wine.sources.map((one) => one.source)).toEqual(["vivino", "openfoodfacts"]);
    expect(wine.candidates[0]?.source).toBe("vivino");

    const gin = await searchCatalogue(bothSources(HENDRICKS).sources, {
      query: "Hendrick's gin",
      kind: "kind_gin",
    });
    expect(gin.sources.map((one) => one.source)).toEqual(["openfoodfacts", "vivino"]);
    expect(gin.candidates.slice(0, 4).map((one) => one.source)).toEqual([
      "openfoodfacts",
      "openfoodfacts",
      "openfoodfacts",
      "openfoodfacts",
    ]);
  });

  it("asks Vivino first for grappa and sake, as for wine, and Open Food Facts first for a vermouth", async () => {
    for (const [kind, first] of [
      ["kind_grappa", "vivino"],
      ["kind_sake", "vivino"],
      ["kind_vermouth", "openfoodfacts"],
      ["kind_beer", "openfoodfacts"],
    ] as const) {
      const answer = await searchCatalogue(bothSources(HENDRICKS).sources, {
        query: "Hendrick's gin",
        kind,
      });
      expect(answer.sources[0]?.source, kind).toBe(first);
    }
  });

  it("interleaves the two when no Kind is given", async () => {
    const answer = await searchCatalogue(bothSources(HENDRICKS).sources, {
      query: "Hendrick's gin",
    });
    expect(answer.candidates.slice(0, 3).map((one) => one.source)).toEqual([
      "vivino",
      "openfoodfacts",
      "openfoodfacts",
    ]);
  });

  it("refuses a Kind that does not exist, and a search for nothing", async () => {
    const { sources } = bothSources(HENDRICKS);
    await expect(
      searchCatalogue(sources, { query: "x y", kind: "kind_nope" })
    ).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(searchCatalogue(sources, {})).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("a Source off, or not answering", () => {
  it("reports Vivino off, and says what turns it on, when the copy did not configure it", async () => {
    const answer = await searchCatalogue(
      {
        openfoodfacts: openFoodFacts(answering(() => "openfoodfacts-search-hendricks-gin.json")),
        vivino: null,
      },
      { query: "Hendrick's gin", kind: "kind_gin" }
    );

    expect(answer.sources).toEqual([
      { source: "openfoodfacts", state: "consulted", found: expect.any(Number) },
      {
        source: "vivino",
        state: "off",
        found: 0,
        reason: expect.stringContaining("VIVINO_ALGOLIA_KEY"),
      },
    ]);
    expect(answer.candidates.length).toBeGreaterThan(0);
  });

  it("goes on with the other Source when one does not answer", async () => {
    const { sources } = bothSources((asked, source) =>
      source === "vivino" ? timedOut() : HENDRICKS(asked, source)
    );

    const answer = await searchCatalogue(sources, { query: "Hendrick's gin", kind: "kind_gin" });

    expect(answer.sources[1]).toMatchObject({
      source: "vivino",
      state: "unavailable",
      reason: expect.stringContaining("says nothing about the bottle"),
    });
    expect(answer.candidates.every((one) => one.source === "openfoodfacts")).toBe(true);
    expect(answer.candidates.length).toBeGreaterThan(0);
  });

  it("still answers with our Labels when every Source is off", async () => {
    await aLabel({ producer: "Hendrick's", name: "Gin", kindId: "kind_gin", vintage: "nv" });
    const answer = await searchCatalogue(
      { openfoodfacts: null, vivino: null },
      { query: "Hendrick's gin" }
    );
    expect(answer.labels).toHaveLength(1);
    expect(answer.candidates).toEqual([]);
    expect(answer.sources.map((one) => one.state)).toEqual(["off", "off"]);
  });
});

describe("a barcode", () => {
  it("asks Open Food Facts alone, and finds the Label it was scanned for before", async () => {
    const { labelId } = await aLabel({
      producer: "Hendrick's",
      name: "Gin",
      kindId: "kind_gin",
      vintage: "nv",
    });
    await recordSource(labelId, { source: "openfoodfacts", idAtSource: "5010327755014" });
    const { sources, vivinoAsked } = bothSources(() => "openfoodfacts-product-5010327755014.json");

    const answer = await searchCatalogue(sources, { barcode: "5010327755014" });

    expect(vivinoAsked).toEqual([]);
    expect(answer.sources.map((one) => one.source)).toEqual(["openfoodfacts"]);
    expect(answer.labels.map((one) => one.id)).toEqual([labelId]);
    // The candidate says it is already ours, so it is not made a second time.
    expect(answer.candidates).toMatchObject([
      { idAtSource: "5010327755014", strength: 41.7, label: labelId },
    ]);
  });

  it("refuses something that is not a barcode", async () => {
    await expect(
      searchCatalogue({ openfoodfacts: null, vivino: null }, { barcode: "50103277 5501" })
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
