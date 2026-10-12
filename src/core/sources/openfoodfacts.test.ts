import { describe, expect, it } from "vitest";
import { answering, header, timedOut } from "@/test/sources";
import { SourceUnavailable } from "./candidate.ts";
import { USER_AGENT } from "./http.ts";
import { openFoodFacts } from "./openfoodfacts.ts";

// The Open Food Facts adapter against recorded answers (`src/test/sources.ts`): what it asks,
// and how a record becomes a candidate. No request leaves the machine.

describe("Open Food Facts, searched by name", () => {
  it("asks search-a-licious in Italian and English, with an honest User-Agent", async () => {
    const fetcher = answering(() => "openfoodfacts-search-hendricks-gin.json");
    await openFoodFacts(fetcher).search("Hendrick's gin");

    const [asked] = fetcher.asked;
    if (!asked) throw new Error("nothing was asked");
    const url = new URL(asked.url);
    expect(url.origin + url.pathname).toBe("https://search.openfoodfacts.org/search");
    expect(url.searchParams.get("q")).toBe("Hendrick's gin");
    expect(url.searchParams.get("langs")).toBe("it,en");
    expect(header(asked, "user-agent")).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(
      /^kanpai\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/davideimola\/kanpai\)$/
    );
  });

  it("maps a product onto a candidate, with the brand as the producer and the page", async () => {
    const candidates = await openFoodFacts(
      answering(() => "openfoodfacts-search-hendricks-gin.json")
    ).search("Hendrick's gin");

    expect(candidates).toContainEqual({
      source: "openfoodfacts",
      idAtSource: "5010327755014",
      producer: "Hendrick's",
      name: "Heindrick's Gin",
      kind: "kind_gin",
      country: null,
      region: null,
      appellation: null,
      grapes: [],
      strength: null,
      vintages: [],
      // The search index's address, which lags the product's (`docs/research/sources.md` §2d):
      // both serve the same photo.
      imageUrl:
        "https://images.openfoodfacts.org/images/products/501/032/775/5014/front.11.400.jpg",
      pageUrl: "https://world.openfoodfacts.org/product/5010327755014",
      attribution: expect.stringContaining("CC BY-SA"),
    });
  });

  it("drops what is categorised as something other than a drink — the smoked salmon", async () => {
    const candidates = await openFoodFacts(
      answering(() => "openfoodfacts-search-hendricks-gin.json")
    ).search("Hendrick's gin");

    expect(candidates.map((one) => one.idAtSource)).not.toContain("8710176780751");
    expect(candidates.length).toBeGreaterThan(3);
  });

  it("puts what is categorised as a drink before what has no categories at all", async () => {
    const candidates = await openFoodFacts(
      answering(() => "openfoodfacts-search-hendricks-gin.json")
    ).search("Hendrick's gin");

    // The search ranked an uncategorised *Hendricks gin* first; the gin comes first here.
    expect(candidates[0]?.idAtSource).toBe("5010327755014");
  });

  it("asks the accent-folded form too, and keeps each product once", async () => {
    const fetcher = answering(() => "openfoodfacts-search-hendricks-gin.json");
    const candidates = await openFoodFacts(fetcher).search("Diplomático");

    expect(fetcher.asked.map((one) => new URL(one.url).searchParams.get("q"))).toEqual([
      "Diplomático",
      "Diplomatico",
    ]);
    const ids = candidates.map((one) => one.idAtSource);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Open Food Facts, read by barcode", () => {
  it("reads the product, with its strength and its Kind", async () => {
    const fetcher = answering(() => "openfoodfacts-product-5010327755014.json");
    const candidate = await openFoodFacts(fetcher).byId("5010327755014");

    expect(fetcher.asked[0]?.url).toMatch(
      /^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/5010327755014\.json\?fields=/
    );
    expect(candidate).toMatchObject({
      idAtSource: "5010327755014",
      producer: "Hendrick's",
      // The longest of its names: the record's `product_name` is just "Gin".
      name: "Hendrick’s Gin",
      kind: "kind_gin",
      strength: 41.7,
    });
  });

  it("answers no record for a barcode it does not have", async () => {
    const fetcher = answering(() => "openfoodfacts-product-missing.json");
    expect(await openFoodFacts(fetcher).byId("00000017")).toBeNull();
  });

  it("does not ask about something that is not a barcode", async () => {
    const fetcher = answering(() => "openfoodfacts-product-missing.json");
    expect(await openFoodFacts(fetcher).byId("Hendrick's")).toBeNull();
    expect(fetcher.asked).toEqual([]);
  });
});

describe("Open Food Facts not answering", () => {
  it("is unavailable when it answers 503, never an empty answer", async () => {
    const source = openFoodFacts(answering(() => ({ status: 503, body: "busy" })));
    await expect(source.search("Lagavulin")).rejects.toBeInstanceOf(SourceUnavailable);
    await expect(source.byId("5000281005409")).rejects.toThrow("answered 503");
  });

  it("is unavailable when it does not answer in time", async () => {
    const source = openFoodFacts(answering(() => timedOut()));
    await expect(source.search("Lagavulin")).rejects.toThrow("did not answer in time");
  });
});
