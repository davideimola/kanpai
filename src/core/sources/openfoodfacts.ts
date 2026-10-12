import "server-only";

import type { Candidate, Source } from "./candidate.ts";
import { absolute, askJson, type Fetch } from "./http.ts";

// Open Food Facts: open data, an official API, and the one Source with a barcode (ADR-0011).
//
// Two endpoints, the two the measurement found answering (`docs/research/sources.md` §2a):
// **search-a-licious** for text, and the **product API** for a barcode — which is also how a
// candidate is re-read by its id, because an Open Food Facts id *is* the barcode. The older
// `cgi/search.pl` and `/api/v2/search` answered 503 under load and are not used.
//
// Its records are crowd-sourced and noisy: a brand and no producer, no region, no grape, no
// vintage, a year sometimes inside the name. What it has that nothing else has is the
// barcode, and for spirits a strength.

const SEARCH = "https://search.openfoodfacts.org/search";
const PRODUCT = "https://world.openfoodfacts.org/api/v2/product";
const PAGE = "https://world.openfoodfacts.org/product";

const FIELDS = [
  "code",
  "product_name",
  "product_name_it",
  "product_name_en",
  "generic_name",
  "brands",
  "categories_tags",
  "image_front_url",
  "nutriments",
].join(",");

/** What the images and the data are licensed under, and to whom the credit goes. */
export const OPEN_FOOD_FACTS_ATTRIBUTION =
  "Open Food Facts contributors, CC BY-SA (images) and ODbL (data) — https://world.openfoodfacts.org";

/** One product as either endpoint returns it, with only the fields read here. */
export type OpenFoodFactsProduct = {
  code?: string;
  product_name?: string;
  product_name_it?: string;
  product_name_en?: string;
  generic_name?: string;
  /** A comma-separated string from the product API, an array from search-a-licious. */
  brands?: string | string[];
  categories_tags?: string[];
  image_front_url?: string;
  nutriments?: Record<string, unknown>;
};

// Open Food Facts' categories onto our Kinds, most specific first. Only the categories the
// measurement saw on the right records are here; anything else is no hint at all. The ids are
// the ones `0001` and `0010` write out so every copy agrees on them.
const KIND_OF_CATEGORY: readonly (readonly [string, string])[] = [
  ["en:gins", "kind_gin"],
  ["en:rums", "kind_rum"],
  ["en:whiskies", "kind_whisky"],
  ["en:whisky", "kind_whisky"],
  ["en:scotch-whisky", "kind_whisky"],
  ["en:vodkas", "kind_vodka"],
  ["en:tequilas", "kind_tequila_mezcal"],
  ["en:mezcals", "kind_tequila_mezcal"],
  ["en:grappas", "kind_grappa"],
  ["en:brandies", "kind_brandy"],
  ["en:cognacs", "kind_brandy"],
  ["en:sake", "kind_sake"],
  ["en:sakes", "kind_sake"],
  ["en:vermouths", "kind_vermouth"],
  ["en:herbal-liqueur", "kind_liqueur_amaro"],
  ["en:bitters", "kind_liqueur_amaro"],
  ["en:liqueurs", "kind_liqueur_amaro"],
  ["en:ciders", "kind_cider"],
  ["en:meads", "kind_mead"],
  ["en:beers", "kind_beer"],
  ["en:sparkling-wines", "kind_sparkling"],
  ["en:champagnes", "kind_sparkling"],
  ["en:rose-wines", "kind_rose"],
  ["en:red-wines", "kind_red"],
  ["en:white-wines", "kind_white"],
];

/**
 * A product as a candidate, or `null` when it is not one: no barcode, no name, or a product
 * categorised as something other than an alcoholic beverage — the mineral water called *Sveva*
 * and the flour called *Farina* the search returned for two wineries.
 */
export function candidateFromProduct(product: OpenFoodFactsProduct): Candidate | null {
  const code = typeof product.code === "string" ? product.code.trim() : "";
  if (code === "") return null;

  const categories = product.categories_tags ?? [];
  if (categories.length > 0 && !categories.includes("en:alcoholic-beverages")) return null;

  const names = [product.product_name, product.product_name_it, product.product_name_en]
    .map(decoded)
    .filter((name): name is string => name !== null);
  // The longest of the names, because the short one is the generic one: Hendrick's own record
  // is `product_name: "Gin"` beside `product_name_en: "Hendrick's Gin"`.
  const name = names.sort((a, b) => b.length - a.length)[0] ?? decoded(product.generic_name);
  if (!name) return null;

  return {
    source: "openfoodfacts",
    idAtSource: code,
    producer: firstBrand(product.brands),
    name,
    kind: KIND_OF_CATEGORY.find(([category]) => categories.includes(category))?.[1] ?? null,
    // `origins` is where the ingredients came from (Hendrick's says Bulgaria), not where the
    // bottle is from, and there is no other country field: none rather than a wrong one.
    country: null,
    region: null,
    appellation: null,
    grapes: [],
    strength: strengthOf(product.nutriments),
    vintages: [],
    imageUrl: absolute(product.image_front_url),
    pageUrl: `${PAGE}/${encodeURIComponent(code)}`,
    attribution: OPEN_FOOD_FACTS_ATTRIBUTION,
  };
}

function firstBrand(brands: string | string[] | undefined): string | null {
  const list = Array.isArray(brands) ? brands : (brands ?? "").split(",");
  for (const brand of list) {
    const said = decoded(brand);
    if (said) return said;
  }
  return null;
}

function strengthOf(nutriments: Record<string, unknown> | undefined): number | null {
  for (const key of ["alcohol_value", "alcohol_100g", "alcohol"]) {
    const value = nutriments?.[key];
    if (typeof value === "number" && value > 0 && value <= 100) return value;
  }
  return null;
}

// Contributors type names with HTML entities in them (`Джин &quot;Хендрикс&quot;`).
function decoded(text: string | undefined): string | null {
  if (typeof text !== "string") return null;
  const said = text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  return said === "" ? null : said;
}

/** What `fold` leaves of a word: no accents. search-a-licious does not fold them itself. */
function folded(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** A barcode as Open Food Facts takes one: EAN-8 to GTIN-14, digits only. */
export function isBarcode(text: string): boolean {
  return /^\d{8,14}$/.test(text.trim());
}

/** Open Food Facts, asked through `fetcher`. */
export function openFoodFacts(fetcher: Fetch = fetch): Source {
  async function searchOnce(text: string): Promise<OpenFoodFactsProduct[]> {
    const url = new URL(SEARCH);
    url.searchParams.set("q", text);
    // Without `langs`, search-a-licious reads only the English fields, and an Italian wine's
    // name is in `product_name_it`.
    url.searchParams.set("langs", "it,en");
    url.searchParams.set("page_size", "10");
    url.searchParams.set("fields", FIELDS);
    const answer = (await askJson("openfoodfacts", fetcher, url.toString())) as {
      hits?: OpenFoodFactsProduct[];
    } | null;
    return answer?.hits ?? [];
  }

  return {
    name: "openfoodfacts",

    async search(text) {
      // *Diplomático* and *Diplomatico* return different lists, so both are asked when they
      // differ, and what both return is kept once, in the order it first came.
      const forms = [...new Set([text.trim(), folded(text.trim())])].filter((form) => form !== "");
      const answers = await Promise.all(forms.map(searchOnce));
      // A product categorised as a drink before one with no categories at all — *Masi*'s
      // ravioli has none and would otherwise come before its Costasera — each kept in the
      // order the search ranked it.
      const products = answers.flat();
      const drinks = products.filter((one) =>
        one.categories_tags?.includes("en:alcoholic-beverages")
      );
      const seen = new Set<string>();
      const candidates: Candidate[] = [];
      for (const product of [...drinks, ...products.filter((one) => !drinks.includes(one))]) {
        const candidate = candidateFromProduct(product);
        if (!candidate || seen.has(candidate.idAtSource)) continue;
        seen.add(candidate.idAtSource);
        candidates.push(candidate);
      }
      return candidates;
    },

    async byId(code) {
      if (!isBarcode(code)) return null;
      const url = `${PRODUCT}/${code.trim()}.json?fields=${FIELDS}`;
      const answer = (await askJson("openfoodfacts", fetcher, url, {}, [404])) as {
        status?: number;
        product?: OpenFoodFactsProduct;
      } | null;
      if (answer?.status !== 1 || !answer.product) return null;
      return candidateFromProduct({ code: code.trim(), ...answer.product });
    },
  };
}
