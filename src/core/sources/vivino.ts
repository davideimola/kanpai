import "server-only";

import type { Candidate, Source } from "./candidate.ts";
import { absolute, askJson, type Fetch } from "./http.ts";

// Vivino, through its Algolia search index — **opt-in, and off by default** (ADR-0011).
//
// The best catalogue of wine there is for this app (14 of 14 of the owner's wines, a studio
// bottle shot on 13), and not an open one: **Vivino's terms forbid automated access**. Whether
// a copy uses it is that copy's owner's decision, made by putting the Algolia application id
// and search-only key in the environment; nothing in this repository carries either.
//
// What this adapter does and does not do, on purpose:
//
//   - It asks **only Algolia** (`WINES_prod`), the index vivino.com's own search box queries.
//     It never calls vivino.com's `/api/*`, which sits behind a firewall that refuses an
//     honest User-Agent, and it never sends a browser's: getting past that would be the
//     *circumventing technical access controls* the terms name.
//   - It re-reads a wine by `filters=id=<id>`, not by a vivino.com call.
//   - It hotlinks the image the record lists — `bottle_medium` when there is one — and never
//     builds a bottle-shot address for a record that has none (S3 answers those with 403).
//   - The key is Vivino's and may rotate at any deploy. When it stops working the search says
//     Vivino is unavailable and goes on with Open Food Facts and the owner's own words.

/** What the owner sets to turn Vivino on, and what this adapter is built from. */
export type VivinoAccess = { appId: string; key: string };

/** The parts of an Algolia `WINES_prod` hit read here. */
export type VivinoHit = {
  id?: number;
  name?: string;
  type_id?: number;
  alcohol?: number;
  non_vintage?: boolean;
  winery?: { name?: string; region?: { name?: string; country?: string } | null } | null;
  region?: {
    name?: string;
    country?: string;
    /** Present when the region is a protected appellation: DOCG, DOC, AOC. */
    class?: { abbreviation?: string } | null;
  } | null;
  image?: { location?: string; variations?: Record<string, string> } | null;
  vintages?: { id?: number; year?: string }[] | null;
};

// Vivino's wine types onto our Kinds — only the wine types, which the measurement found
// reliable on wine. Type 25 is *spirits and everything else*, user-entered, and a spirit is
// sometimes typed a red (Havana Club 7): no hint rather than a wrong one.
const KIND_OF_TYPE: Record<number, string> = {
  1: "kind_red",
  2: "kind_white",
  3: "kind_sparkling",
  4: "kind_rose",
  7: "kind_sweet",
  24: "kind_fortified",
};

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" });

function countryOf(code: string | undefined): string | null {
  if (!code || !/^[a-z]{2}$/i.test(code)) return null;
  try {
    return COUNTRY.of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/** A hit as a candidate, or `null` when it has no id or no name. */
export function candidateFromHit(hit: VivinoHit): Candidate | null {
  if (typeof hit.id !== "number" || !hit.name?.trim()) return null;

  // A region with a class (DOCG, DOC) is an appellation, and the winery's region is then the
  // region: Costasera is *Amarone della Valpolicella Classico* in *Veneto*.
  const appellation = hit.region?.class ? (hit.region.name ?? null) : null;
  const region = appellation
    ? (hit.winery?.region?.name ?? null)
    : (hit.region?.name ?? hit.winery?.region?.name ?? null);

  // `"U.V."` is Vivino's *unknown*, and a `""` year is listed on dated wines as well as on NV
  // ones: neither says anything. `non_vintage` is what says NV.
  const years = new Set<number>();
  for (const vintage of hit.vintages ?? []) {
    if (vintage.year && /^\d{4}$/.test(vintage.year)) years.add(Number(vintage.year));
  }
  const nv = hit.non_vintage === true;

  const variations = hit.image?.variations ?? {};
  return {
    source: "vivino",
    idAtSource: String(hit.id),
    producer: hit.winery?.name?.trim() || null,
    name: hit.name.trim(),
    kind: (hit.type_id !== undefined && KIND_OF_TYPE[hit.type_id]) || null,
    country: countryOf(hit.region?.country ?? hit.winery?.region?.country),
    region,
    appellation,
    grapes: [],
    strength: typeof hit.alcohol === "number" && hit.alcohol > 0 ? hit.alcohol : null,
    vintages: [...[...years].sort((a, b) => b - a), ...(nv ? (["nv"] as const) : [])],
    imageUrl: absolute(variations.bottle_medium ?? variations.large ?? hit.image?.location),
    pageUrl: `https://www.vivino.com/w/${hit.id}`,
    attribution: "Vivino — https://www.vivino.com",
  };
}

/**
 * Vivino through Algolia with `access`, asked through `fetcher`.
 *
 * Algolia answers a key it does not accept with 403 JSON, which reaches the search as
 * *Vivino unavailable*, never as an empty answer.
 */
export function vivino(access: VivinoAccess, fetcher: Fetch = fetch): Source {
  const url = `https://${access.appId.toLowerCase()}-dsn.algolia.net/1/indexes/WINES_prod/query`;

  async function query(body: Record<string, unknown>): Promise<VivinoHit[]> {
    const answer = (await askJson("vivino", fetcher, url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": access.appId,
        "x-algolia-api-key": access.key,
      },
      body: JSON.stringify(body),
    })) as { hits?: VivinoHit[] } | null;
    return answer?.hits ?? [];
  }

  return {
    name: "vivino",

    async search(text) {
      const hits = await query({ query: text.trim(), hitsPerPage: 10 });
      return hits.map(candidateFromHit).filter((one): one is Candidate => one !== null);
    },

    async byId(id) {
      if (!/^\d+$/.test(id.trim())) return null;
      const [hit] = await query({ query: "", filters: `id=${id.trim()}`, hitsPerPage: 1 });
      return hit ? candidateFromHit(hit) : null;
    },
  };
}
