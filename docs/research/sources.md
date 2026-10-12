# Sources: Open Food Facts and Vivino

**Researched:** 2026-10-12 · Question: how many of the owner's real Labels do Open Food Facts and
Vivino each resolve, by which query, with what facts and what image; which endpoints work today;
and whether either can recognise a photographed label
([ADR-0006](../adr/0006-sources-are-open-food-facts-then-vivino-and-images-are-hotlinked.md),
[spec §7](../spec.md#7-open-questions)). A recommendation is made at the end.

## How to read this

- **Every number here is measured**, from requests made on 2026-10-12 from one residential IP in
  Italy. The sample is the 14 wines of [source-sample.md](source-sample.md) plus three common
  spirits (Lagavulin 16, Diplomático Reserva Exclusiva, Nonino Grappa Tradizione).
- A Label counts as **found** only when the hit is the same Label — same producer, same name. A
  sibling (Campofiorin for *Brolo* Campofiorin) or a homonym (a mineral water branded *Sveva* for
  Rocca Sveva) is a miss, and is called out because an adapter that takes the first hit would
  store it.
- Requests were few and spaced (1.2–3 s apart, about 300 in all across both sources, images
  included). No 429 was seen on either source. Endpoints, headers and terms move: re-run the
  probes in §8 before trusting a detail here months from now.
- The probes were throwaway scripts outside the repo; the commands that matter are written out.

---

## Answer

**Vivino finds all 14 wines; Open Food Facts finds 2.** On spirits the result flips, weakly:
Open Food Facts finds 2 of 3 and Vivino 2 of 3, both with poor data.

| | wines found | first hit is the Label (producer + name) | the year's Vintage present | clean bottle shot |
|---|---|---|---|---|
| **Vivino** (Algolia search) | **14/14** | 12/14 (the other two second and third) | 9/9 dated wines | 13/14 |
| Vivino (`/api/explore/explore`) | 8/14 | 4/14 | — | — |
| **Open Food Facts** (search-a-licious) | **2/14** | 1/14 | no vintage field | 1/14, at 119×377 px |

The search that works is **not a vivino.com endpoint**. It is Vivino's own **Algolia index**
(`WINES_prod`), queried with the public, search-only key shipped in vivino.com's JavaScript. It
answers in ~170 ms, returns the wine id, the producer, the region, every Vintage with its id, the
rating and the image variants in one call, and it accepts an honest User-Agent. The vivino.com
`/api/*` endpoints work too, but sit behind a CloudFront firewall that answers **403 to any
non-browser User-Agent — including Node's default `fetch`** — so using them means sending a
browser-like User-Agent.

**Vivino's images are stable enough to store.** They are content-addressed files on
`images.vivino.com` (S3 behind CloudFront), served `cache-control: max-age=31536000, public`, with
`last-modified` dates back to 2016. Thirteen of the fourteen wines have a studio **bottle shot** on
a transparent background; the fourteenth (Parziale Appassimento) has only a user's photograph of
the label.

**Open Food Facts is the right source for a barcode and the wrong one for wine by name.** Its
wine coverage for small Italian producers is close to empty (Corsini, Montelliana, Rocca Sveva,
Farina, Biscardo, Le Corti, Tenuta San Guido: no product at all), its images are crowd photos
(shelf shots, blurred close-ups, a sideways bottle) and its text search answers *Rocca Sveva*
with a mineral water and *Farina* with Barilla flour. When a barcode *is* there, the record is exact.

**No label recognition is reachable from outside.** Vivino's scanner exists only in its mobile
apps; vivino.com has none (`/scanner` redirects to a marketing article). Browser OCR
(Tesseract.js) fed into the Vivino search resolved **6 of 13 clean label crops and 1 of 7 real
phone photos**.

**Three findings contradict ADR-0006** and are listed in §7: the order (Open Food Facts first) is
backwards for wine; Vivino's terms do not merely "not invite" this use, they forbid automated
access and the circumvention of access controls; and the endpoint the adapter should use is
Algolia, not "the endpoints its own website uses" on vivino.com.

---

## 1. The sample

The 14 wines are the owner's, as transcribed in [source-sample.md](source-sample.md). The three
spirits are not the owner's (he had none recorded); they were chosen as common bottles from three
spirit families. The spec's S3 line asks for ~30 Labels; 17 is what exists today, and the gap
between the two sources is wide enough that 30 would not change the conclusion.

For each Label the queries were: producer + name; producer + name + year (when known); name
alone; producer alone (Open Food Facts only); and the accent-folded form when it differs.

---

## 2. Open Food Facts

### 2a. Endpoints

| Endpoint | Status on 2026-10-12 | Use |
|---|---|---|
| `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=…` | **200**, ~0.2 s | barcode lookup |
| `GET https://search.openfoodfacts.org/search?q=…&langs=it,en&page_size=…&fields=…` (search-a-licious) | **200**, ~0.2 s | text search |
| `GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=…&json=1` | **503** on the first call, 200 an hour later | avoid |
| `GET https://world.openfoodfacts.org/api/v2/search?brands_tags=…` | **503** on two of four calls (`world.` and `it.`) | avoid |

The 503 page reads "*Our services are currently experiencing unusually high demand … Registered
users are not subject to request limits*". The API documentation states the limits directly:
"*15 req/min/IP address for all read product queries*", "*10 req/min/IP address for all search
queries (GET /api/v\*/search or GET /cgi/search.pl requests); don't use it for a search-as-you-type
feature*", and global limits that answer "*HTTP 503 … if these limits are exceeded*". It asks for
"*a custom User-Agent … in the form of AppName/Version (ContactEmail)*" and no other
authentication for reads ([API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/)).
search-a-licious is a separate service (its own `openapi.json`, "search-a-licious API 0.1.0") and
returned no 503 in this session.

search-a-licious defaults to English fields: `q=sassicaia` without `langs` searches only
`product_name.en`, `brands`, `categories.en`, … Pass `langs=it,en`. It accepts Lucene syntax
(`brands:corsini` works; `brands:a OR brands:b` returned HTTP 500).

### 2b. Per Label

| # | Label | found | by which query | barcode | image | notes |
|---|---|---|---|---|---|---|
| 1 | Corsini Cortevecchia Riserva | no | — | — | — | `brands:corsini` returns 125 products of *Corsini*, a Tuscan bakery, and a coffee roaster |
| 2 | Corsini Don Tommaso | no | — | — | — | |
| 3 | Sassicaia | no | — | — | — | `q=sassicaia` → 0 hits |
| 4 | Masi Brolo Campofiorin | **sibling only** | producer + name, first | 8002062000068 | — | the hit is *Campofiorin* 2007, a different Label |
| 5 | Masi Costasera | **yes** | name alone, first (not in the top 5 with the producer prepended) | 8002062000051 | shelf photo of the label, 429×754 | 15 % from `nutriments.alcohol_value`; name says "2011" |
| 6 | Biscardo Parziale Appassimento | no | — | — | — | |
| 7 | Rocca Sveva Valpolicella Superiore | no (**false positive**) | producer, first | (8008417001032) | — | the hit is *Sveva*, a carbonated mineral water |
| 8 | Farina Valpolicella Cl. Sup. | no (**false positives**) | — | — | — | `Farina` is Italian for flour: Barilla, Eurospin |
| 9 | Montelliana Asolo Prosecco | no | — | — | — | `q=montelliana` → 0 hits |
| 10 | Le Corti Chianti Classico | no | — | — | — | pasta *corti* |
| 11 | Corsini Sparkling Rosé | no | — | — | — | |
| 12 | Montelliana Mont Blanc | no | — | — | — | |
| 13 | Berlucchi Cuvée Imperiale Brut | **yes** | producer + name, first | 80107415 | clean studio shot, but **119×377** at every size | DOCG, Franciacorta in `categories_tags` |
| 14 | Biscardo Enigma | no | — | — | — | |
| S1 | Lagavulin 16 | **yes** | producer + name, first | 5000281005409 (70 cl), 5000281003627 (1 l) | the gift tube, 275×851 | 43 %, `en:scotch-whisky` |
| S2 | Diplomático Reserva Exclusiva | **weak** | producer + name, first | 75970185 | a phone photo of the bottle lying on its side, 1745×744 | product name "Rum diplomatico", no brand, no category |
| S3 | Nonino Grappa Tradizione | no | — | — | — | brand *Nonino* has five grappe (Vendemmia, Il Moscato, Il Merlot, Chardonnay); none is Tradizione |

**Hit rate: wines 2/14 (14 %), spirits 2/3** (one of them without brand or category).

### 2c. What a record carries

A barcode lookup (`/api/v2/product/80107415.json?fields=…`) returns, for the fields that matter:

```
code               "80107415"
product_name       "Berlucchi Cuvée Imperiale Franciacorta D.O.C.G."
product_name_it    "Berlucchi Cuvée Imperiale Franciacorta D.O.C.G."
brands             "Berlucchi"                       ← the producer, when present
generic_name       "Franciacorta"
categories_tags    ["en:wines","en:wines-from-italy","it:franciacorta","it:Spumante", …]
labels_tags        ["it:docg"]
quantity           "0.750 l"
origins            "Italy"
nutriments.alcohol_value  15                         ← present on 2 of 5 records read (Costasera, Lagavulin)
image_front_url    ".../images/products/000/008/010/7415/front_it.6.400.jpg"
selected_images.front.{display,small,thumb}.{lang}   ← one URL per language and size
```

There is **no producer field separate from the brand, no region, no grape, no vintage**. The year,
when present, is inside the product name ("Costasera Amarone … 2011"). A barcode names a Label,
not a Vintage — the same EAN is printed on every year — which matches our model. Records are
noisy: the Berlucchi record also carries `en:snacks` and `en:salty-snacks`.

### 2d. Images

- `https://images.openfoodfacts.org/images/products/<barcode split 3/3/3/rest>/front_<lang>.<rev>.<size>.jpg`,
  sizes `100`, `200`, `400` and `full`. Served by nginx with **no `cache-control` header**.
- The **revision number is in the URL**. The URL a lookup returns changes when a contributor
  uploads a new front photo, but old revisions stay served: Lagavulin's `front.3.400.jpg` (the
  URL the search index still had) and `front_en.27.400.jpg` (the product's current one) both
  answered 200, with different photos. The search index lags the product: it returned
  `products/80107415/front.6.400.jpg` while the product API returned the zero-padded
  `products/000/008/010/7415/front_it.6.400.jpg`; both serve the same bytes.
- Quality, on the five images inspected: one clean studio shot (Berlucchi, but 119×377 even at
  `full`), a gift box, a shelf photo, a blurred close-up of a different Nonino grappa, and a
  sideways phone photo.
- **Licence:** "*Products images are available under the Creative Commons Attribution ShareAlike
  licence*"; the database is ODbL ([terms of use](https://world.openfoodfacts.org/terms-of-use)).
  Hotlinking is fine; a public page needs an attribution.

---

## 3. Vivino

### 3a. Endpoints

| Endpoint | Status on 2026-10-12 | Notes |
|---|---|---|
| `POST https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query` | **200**, ~170 ms, any User-Agent | **the search to use** |
| `GET https://www.vivino.com/api/vintages/{vintage_id}` | 200 with a browser User-Agent, **403** otherwise | full detail of one Vintage |
| `GET https://www.vivino.com/api/vintages?vintage_ids[]=…&vintage_ids[]=…&full=true` | 200 (browser UA) | the same, batched |
| `GET https://www.vivino.com/api/explore/explore?search_term=…` | 200 (browser UA), ~0.45 s, 250 KB per 5 results | not a relevance search: avoid |
| `GET https://www.vivino.com/search/wines?q=…` | 302 → `/it/explore?search_term=…`, 2.7 MB HTML | the explore results embedded in a `data-ssr-props` attribute |
| `GET https://www.vivino.com/w/{wine_id}?year=…` | 200 (browser UA), redirects to the localised slug | the page to link; JSON embedded in `data-ssr-props` |
| `GET https://www.vivino.com/api/wines/{wine_id}` | **404** | gone |
| `GET https://www.vivino.com/api/wines/{wine_id}/vintages` | **404** | gone |

**The firewall.** vivino.com is fronted by CloudFront with AWS WAF (the page loads
`…edge.sdk.awswaf.com/…/challenge.js`). On `/api/vintages/23593` the WAF answered:

| User-Agent | status |
|---|---|
| `kanpai/0.1`, `kanpai/0.1 (+https://github.com/davideimola/kanpai)` | 403 |
| `Mozilla/5.0 (compatible; kanpai/0.1)` | 403 |
| `node`, `undici`, Node 22's `fetch` default, none at all | 403 |
| `python-requests/2.32` | 403 |
| `curl/8.7.1` | 200 |
| a desktop Chrome string, with or without ` kanpai/0.1` appended | 200 |

No cookie, `Referer` or other header was needed once the User-Agent passed. The 403 is an HTML
CloudFront page ("*Request blocked*"), not JSON.

**Algolia.** The navigation bundle (`/packs/navigation-*.js`) builds the search box with
`algoliasearch("9TAKGWJUXL","<VIVINO_ALGOLIA_KEY>").initIndex("WINES_prod")` and
`hitsPerPage: 6`. The key is a search-only key meant to be public; it is left out of this note on purpose — it is Vivino's, it can rotate, and a copy would read it from configuration rather than from here (`<VIVINO_ALGOLIA_KEY>` below). The endpoint is Algolia's, not
Vivino's: it is not behind the WAF, it answers `Access-Control-Allow-Origin: *`, and it took
`kanpai/0.1 (research)` as User-Agent. It also accepts `filters=id=<wine_id>`, which re-reads a
known wine without a text query.

**explore is the wrong search.** It returns vintages ordered by the explore page's own ranking
over a market-filtered set (wines on sale in the chosen country), not by match: `search_term=sassicaia`
returned 24 Sassicaia vintages without 2005; Biscardo Parziale, Rocca Sveva Valpolicella
Superiore, Farina, Montelliana (both), Corsini Rosé and all three spirits returned 0 or the wrong
Label. It found 8 of 14, four of them first.

### 3b. Per Label (Algolia, query = producer + name)

| # | Label | found | position | wine id | year → vintage id | image | region | grapes (from `/api/vintages`) | style | wine rating (count) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cortevecchia Riserva | yes | 1st | 1174495 | 2022 → 171588207 | bottle shot | Chianti Classico | Sangiovese | Italian Chianti Classico Red | 3.9 (1,531) |
| 2 | Don Tommaso Gran Selezione | yes | 1st | 4090296 | 2022 → 177358944 | bottle shot | Chianti Classico | Sangiovese | Italian Chianti Classico Red | 4.1 (1,112) |
| 3 | Sassicaia | yes | 1st | 5078 | 2005 → 23593 | bottle shot | Bolgheri Sassicaia | Cabernet Franc, Cabernet Sauvignon | Bolgheri Italiano | 4.6 (134,819) |
| 4 | Brolo Campofiorin | yes | 1st | 21947 | 2021 → 167217987 | bottle shot | Rosso Veronese | Oseleta, Corvina, Rondinella | Rosso Italia Settentrionale | 3.8 (20,846) |
| 5 | Costasera Amarone | yes | 1st | 21929 | 2004 → 88482 | bottle shot (the 2004 Vintage has its own) | Amarone della Valpolicella Classico | Corvina, Rondinella, Molinara | Amarone | 4.3 (115,495) |
| 6 | Parziale Appassimento Rosso | yes | 1st | 10023255 | 2022 → 172994366 | **user photo** of the label | Veneto | — | Rosso Italia Settentrionale | 4.3 (227) |
| 7 | Rocca Sveva Valpolicella Superiore | yes | **2nd** (the Ripasso first) | 1216561 | 2018 → 161314308 | bottle shot | Valpolicella | Corvina, Rondinella, Molinara | Valpolicella | 3.7 (1,409) |
| 8 | Farina Valpolicella Cl. Sup. | yes | **3rd** (two *Remo Farina* wines first) | 1726232 | unknown | bottle shot | Valpolicella Classico | Corvina, Rondinella, Molinara, Corvinone | Valpolicella | 3.8 (1,662) |
| 9 | Montelliana Asolo Prosecco Extra Dry | yes | 1st | 1173061 | 2017 → 154738442 | bottle shot | Prosecco | Glera | Prosecco | 3.7 (311) |
| 10 | Le Corti Chianti Classico | yes | 1st | 1184461 | 2024 → 179624610 | bottle shot | Chianti Classico | Sangiovese | Italian Chianti Classico Red | 3.8 (5,067) |
| 11 | Corsini Sparkling Rosé | yes | 1st | 1584363 | unknown | bottle shot | Toscana | Sangiovese | Italian Sparkling | 4.0 (366) |
| 12 | Montelliana Mont Blanc | yes | 1st | 2989443 | unknown | bottle shot | Prosecco di Treviso | Glera | Prosecco | 3.6 (236) |
| 13 | Berlucchi Cuvée Imperiale Brut | yes | 1st | 1185753 | NV | bottle shot | Franciacorta | Pinot Nero, Chardonnay | Italian Franciacorta Sparkling | 3.8 (16,439) |
| 14 | Biscardo Enigma | yes | 1st | 6202115 | unknown | bottle shot | Rubicone | Sangiovese | Rosso Italia Settentrionale | 4.3 (8,513) |

**Hit rate: 14/14 (100 %).** Every year the owner recorded exists as a Vintage with its own id
(9/9). Two things the table shows that the adapter must absorb:

- **Vivino has the same split producers the sample warned about, as separate wineries.**
  *Fattoria le Corti* and *Principe Corsini* are two wineries, and each has a *Cortevecchia
  Riserva* (1174495 under Corsini, 2694532 under Le Corti); *Biscardo* and *Martino Biscardo -
  L'Ornato* are two wineries too. The id Vivino returns is the one under the producer string the
  query used.
- A generic name loses to a sibling: #7 comes second and #8 third. The adapter returns candidates,
  never an automatic pick.

### 3c. Spirits

| Label | found | wine id | image | notes |
|---|---|---|---|---|
| Lagavulin 16 | **no** | — | — | `q=Lagavulin` returns three user-created entries (Distillers Edition and two others), `winery: null`, `type_id: 25`; no 16 |
| Diplomático Reserva Exclusiva | yes | 1216609 | user photo | named "Ron Antiguo Diplomatico Exclusiva Reserva", `winery: null`, `region: null`, `alcohol: 0`; a duplicate (2330442) exists |
| Nonino Grappa Tradizione | yes | 1936505 | user photo | winery "Grappa Nonino", region **Toscana** (it is Friulian), `alcohol: 0`; a 50° duplicate (4498162) |

**Hit rate: 2/3**, with no bottle shot, no producer on one, a wrong region on the other. Spirits on
Vivino are user-entered records outside the wine types (`type_id` 7 and 25; the wines are 1 red,
3 sparkling).

### 3d. What a record carries

**Search** — one call, enough to show candidates and to store a Source:

```
POST https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query
X-Algolia-Application-Id: 9TAKGWJUXL
X-Algolia-API-Key: <VIVINO_ALGOLIA_KEY>
Content-Type: application/json

{"query": "Principe Corsini Cortevecchia Riserva Chianti Classico", "hitsPerPage": 10}
```

```
nbHits                    1
hits[].id                 1174495                     ← the wine id: our Label's id_at_source
hits[].name               "Cortevecchia Riserva Chianti Classico"
hits[].winery.name        "Principe Corsini"          ← null on user-entered spirits
hits[].region.name        "Chianti Classico"          (region.country.code "it")
hits[].type_id            1                           ← 1 red, 2 white, 3 sparkling, 4 rosé observed
hits[].grapes             [16]                        ← ids only
hits[].alcohol            13.5                        ← 0 when unknown
hits[].non_vintage        false
hits[].image.location     "//images.vivino.com/thumbs/AylS2LSJS9uEq2D0_GLoTg_pl_480x640.png"
hits[].image.variations   {bottle_medium: "…_pb_x600.png", bottle_large: "…_pb_x960.png", label: …, …}
hits[].vintages[]         {id: 171588207, year: "2022", statistics: {…}}, …, {year: "U.V."}
hits[].statistics         {ratings_average: 3.9, ratings_count: 1500, …}
```

Every wine lists a `"U.V."` (unknown vintage) entry; an NV wine also lists one with `year: ""`.

**Detail** — only when grape names, style or the Vintage's own image are wanted:

```
GET https://www.vivino.com/api/vintages/171588207
User-Agent: <a browser string>
Accept: application/json
```

```
vintage.id, .name, .year, .statistics.ratings_average
vintage.image.variations.bottle_medium           ← may differ per year (Costasera 2004 does)
vintage.wine.{id, name, alcohol, type_id, closure}
vintage.wine.winery.name
vintage.wine.region.{name, country.code}
vintage.wine.grapes[].name                       ["Sangiovese"]
vintage.wine.style.{name, body, acidity, food[]}
vintage.wine_facts.alcohol
```

Names come back localised to the redirecting market (`Manzo`, `Corposo`, `Valutazione in
Italia`); `language=en` on explore had no visible effect on style names.

**The page to link:** `https://www.vivino.com/w/{wine_id}` (it redirects to
`/it/principe-corsini-cortevecchia-riserva-chianti-classico/w/1174495`).

### 3e. Images

- Two families, told apart by the path:
  - `//images.vivino.com/thumbs/<hash>_pb_x600.png` (`bottle_medium`) — a **studio bottle shot on
    a transparent background**, 158–222×600, 33–42 KB; `_pb_x960` is 256×960, ~83 KB;
    `_pl_480x640.png` is a crop of the label. Present only when `image.variations` lists the
    `bottle_*` keys.
  - `//images.vivino.com/labels/<hash>.jpg` — a **user's photo** of the label, 480×640, with
    only `large`/`medium`/`*_square` variants. Constructing a `_pb_` URL for one returns **403**
    from S3: use the variants the record lists, never a guessed one.
- Served from S3 through CloudFront, `cache-control: max-age=31536000, public`, `last-modified`
  from 2016 to 2025. The hash names the content, so a URL either keeps its bytes or disappears
  when Vivino replaces a wine's image; it does not change under us.
- Any User-Agent and any `Referer` (tried: `https://kanpai.davideimola.dev/`) got a 200: hotlinking
  is not blocked.
- The URLs are protocol-relative; prefix `https:`.

### 3f. Terms

Vivino's [terms of service](https://www.vivino.com/legal/terms-of-service), as served today, say
users must not "*access or attempt to access the Vivino Platform through automated means,
scraping tools, crawlers, or bots, or circumvent technical access controls or rate limits, except
as expressly authorized by Vivino*". `robots.txt` disallows only `/wine-searcher/` for `*`. Two
consequences: any automated use of Vivino is outside its terms, as ADR-0006 knew; and sending a
browser User-Agent to get past the WAF's 403 is the kind of thing "*circumvent technical access
controls*" describes. The Algolia search does not need that; only the vivino.com `/api/*`
detail calls do.

---

## 4. Query strategy

**Vivino (Algolia).**

- **Query producer + name, without the year.** 14/14. Algolia requires every word to match
  (with typo tolerance: `Cortevechia Corsini` still found Cortevecchia), so a producer word Vivino
  does not have breaks the query: `Principe Corsini Le Corti Chianti Classico` returned a Le Corti
  *grappa*. The year is not needed — the hit's `vintages[]` maps year → vintage id — and alone it
  adds noise (`Costasera 2004` → 31 hits including Chilean *Costanera*).
- **If no hit's winery matches the producer, retry with the name alone.** Name alone found
  10/14: it works for distinctive names (Cortevecchia, Don Tommaso, Brolo Campofiorin, Enigma,
  Mont Blanc) and fails for generic ones (*Valpolicella Superiore*: 1,650 hits; *Sparkling Rosé*:
  2,005).
- **Accent folding is not needed.** Algolia folds accents: `Cuvée` and `Cuvee` give the same
  result, and they match Vivino's own misspelling `Cuveé`. Dashes and apostrophes too:
  `Martino Biscardo – L'Ornato Parziale…` found the winery spelled `Martino Biscardo - L'Ornato`.
- **Never auto-pick.** Show the top hits with winery, region and bottle shot; the owner (or the
  assistant) chooses.

**Open Food Facts.**

- **Barcode first, by lookup**, not by search: it is exact when present and it is the only thing
  Open Food Facts does better than Vivino (Vivino's web has no barcode search).
- **Text: the name alone**, with `langs=it,en`, then keep only hits whose `brands` contains a
  producer word and whose `categories_tags` include `en:alcoholic-beverages`. Prepending the
  producer pushed Costasera out of the top 5; a producer alone returns flour, water and pasta.
- **Fold accents, or send both forms.** search-a-licious does not fold: `Diplomático` and
  `Diplomatico` return different hit lists.

---

## 5. Label photo recognition

**Vivino: not usable from outside.** Label scanning is a feature of the iOS and Android apps.
vivino.com has no scanner: the route list in its navigation bundle includes `/scanner/*` and
`/last-scanned`, and `https://www.vivino.com/scanner` redirects to
`/it/wine-news/vivino-wine-scanner`, a marketing article. Nothing in the three web bundles read
(`common`, `navigation`, `vintageExplorerPage`) uploads an image for recognition. The app's API
needs a logged-in app session; reverse-engineering it would be the clearest possible breach of
the terms quoted in §3f, and it was not attempted.

**Browser OCR, measured.** Tesseract.js 5.1.1 (`ita`+`eng`, no preprocessing) was run on 20
images, and the words of four letters or more were sent to the Algolia search with
`removeWordsIfNoResults: "allOptional"`:

| input | resolved to the right Label in the top 3 |
|---|---|
| Vivino's clean label crops (`_pl_480x640`), 13 | **6** — Sassicaia, Cortevecchia, Don Tommaso, Costasera, Brolo Campofiorin (third), Montelliana Asolo (second) |
| real phone photos (Vivino user photos and Open Food Facts photos), 7 | **1** — Costasera, a straight shelf shot |

What failed is typical of wine labels: script and decorative type (Mont Blanc, Corsini Rosé: no
text read at all), gold on black (L'Ornato: `ornatoj`), small caps misread (`BERLUGONI`), and
appellation boilerplate drowning the name (`DENOMINAZIONE DI ORIGINE CONTROLLATA`). It costs a
~8 MB language download (`ita` 3.1 MB + `eng` 5.2 MB) and, in Node on a laptop, 0.04–1.4 s per image.

**The realistic options for `/add`**, none of which needs an LLM in the app:

1. **The phone's own text recognition into the search box.** iOS offers *Scan Text* from any
   text field (Live Text), Android's keyboards offer similar; the owner points the camera, picks
   the words, and the ordinary text search runs. Free, no code, better than Tesseract on stylised
   type (not measured here).
2. **Tesseract.js as a pre-fill**, never as an answer: OCR → words in the search box → candidates
   with bottle shots → the owner picks. On this sample it would pre-fill something useful about
   half the time on a clean label and rarely on a real photo.
3. **The barcode** (S6's scanner) → Open Food Facts. Exact, but Open Food Facts has 2 of the 14
   wines.
4. **The photo in the Claude app over MCP** — already the planned first path (S5). The external
   assistant reads the label with its own vision; the app spends nothing.

---

## 6. Hotlinking

| | Vivino | Open Food Facts |
|---|---|---|
| host | `images.vivino.com` (S3 + CloudFront) | `images.openfoodfacts.org` (nginx) |
| cache header | `max-age=31536000, public` | none |
| URL stability | content-addressed; observed unchanged since 2016–2017 | revision in the URL; the current URL changes on re-upload, old revisions still served |
| sizes | bottle 300/600/960 px tall; label 150×200 to 480×640 | 100/200/400 px and `full` (varies, 377–1200 px tall here) |
| what to store | `image.variations.bottle_medium` if present, else `image.variations.large` | `image_front_url` (the 400 size) |
| blocked when hotlinked | no (any UA, any `Referer`) | no |
| licence | none granted; Vivino's images | CC BY-SA, attribution required |

The images are fetched by the owner's browser from a plain `<img>`, as ADR-0006 says; nothing is
proxied.

---

## 7. Recommendation, and the answers to ADR-0006

**The adapter.** One module, two backends, chosen by what the owner gave:

- **A barcode** → Open Food Facts product lookup. No Vivino call: it has no barcode search.
- **Text** → **Vivino (Algolia) first**, Open Food Facts search second, merged as candidates. For a
  Kind that is a spirit, Open Food Facts first: there it found 2/3 with an exact barcode, and
  Vivino's spirit records are user-entered.
- **Store at Label level** the Vivino *wine* id (`id_at_source`), `https://www.vivino.com/w/{id}`
  as the page and `bottle_medium` as the image. Take the Vintage's id from `vintages[]` only for
  matching the year; nothing in our schema needs it stored.
- **Re-read a known wine** with Algolia `filters=id=<wine_id>`, not by a vivino.com call.
- **Grape names and style**, if wanted at creation, come from one `/api/vintages/{id}` call. It
  needs a browser User-Agent (see below); the Algolia record's grape ids and `region.name` are
  enough for a candidate.
- **Failure is "no answer"**, as ADR-0006 says: a 403 HTML page, an Algolia error, or a key that
  stops working all degrade to Open Food Facts and the owner's own text.

**ADR-0006's open question.** *The exact Vivino endpoints:* the Algolia query above for search
and re-reads; `/api/vintages/{id}` for detail; `/w/{id}` for the page. *Whether the image URLs are
stable enough to store:* yes — content-addressed, year-long public cache headers, files
unchanged since 2016.

**Where the findings contradict ADR-0006** (the ADR is left as it is; this is for whoever revises
it):

1. **The order.** ADR-0006 puts Open Food Facts first and Vivino as the fallback. For wine by name
   that is backwards: Open Food Facts resolved 2 of 14 and produced three confident false
   positives (a mineral water for Rocca Sveva, flour for Farina, *Campofiorin* for *Brolo*
   Campofiorin); Vivino resolved 14 of 14. Open Food Facts first is right only for a barcode and
   for spirits.
2. **"Its terms do not invite this use."** They forbid it in so many words (§3f), and they also
   forbid circumventing access controls — which is what a browser User-Agent on vivino.com's
   `/api/*` amounts to. The Algolia search keeps an honest User-Agent; the detail call does not.
   The owner accepted the unofficial fallback; this sharpens what was accepted. Keeping the
   adapter to Algolia (and skipping `/api/vintages` unless grape names prove worth it) keeps the
   app off the WAF entirely.
3. **"The undocumented endpoints its own website uses."** The one that matters belongs to Algolia,
   with a key Vivino can rotate at any deploy. The adapter should read the key from configuration,
   not code, so a rotation is an environment change.

---

## 8. How to re-run

```sh
# Open Food Facts — barcode
curl -s -A "kanpai/0.1 (you@example.com)" \
  "https://world.openfoodfacts.org/api/v2/product/80107415.json?fields=code,product_name,brands,categories_tags,quantity,nutriments,image_front_url"

# Open Food Facts — text
curl -s -A "kanpai/0.1 (you@example.com)" --get "https://search.openfoodfacts.org/search" \
  --data-urlencode "q=Costasera Amarone della Valpolicella Classico" \
  --data "langs=it,en&page_size=10&fields=code,product_name,brands,image_front_url"

# Vivino — search (Algolia)
curl -s -A "kanpai/0.1" \
  -H "X-Algolia-Application-Id: 9TAKGWJUXL" -H "X-Algolia-API-Key: <VIVINO_ALGOLIA_KEY>" \
  -d '{"query":"Principe Corsini Cortevecchia Riserva Chianti Classico","hitsPerPage":10}' \
  "https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query"

# Vivino — re-read by id (Algolia)
curl -s -A "kanpai/0.1" \
  -H "X-Algolia-Application-Id: 9TAKGWJUXL" -H "X-Algolia-API-Key: <VIVINO_ALGOLIA_KEY>" \
  -d '{"query":"","filters":"id=1174495"}' \
  "https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query"

# Vivino — the WAF check: 403 with an app UA, 200 with a browser UA
for ua in "kanpai/0.1" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"; do
  curl -s -o /dev/null -w "%{http_code}  $ua\n" -A "$ua" "https://www.vivino.com/api/vintages/23593"; sleep 2
done

# The Algolia key, if it stops working: it is in the navigation bundle
curl -s -A "<browser UA>" https://www.vivino.com/search/wines?q=x -L | grep -o '/packs/navigation-[^"]*\.js'
# then grep that file for initIndex("WINES_prod")
```

A hit counts only when the producer and the name match; distinguish 403 (blocked) and 503
(throttled) from an empty result, as tsundoku's cover research learned the hard way.

---

## 9. Spirits, gin, rum and sake

**Researched:** 2026-10-12 · Question: the spirits sample above was three bottles. Does the
picture hold for gin, rum, sake, whisky, amaro and grappa, and is there a spirits- or
sake-specific source with an open API that beats Vivino and Open Food Facts there? Same rules as
above: requests from one residential IP in Italy, User-Agent `kanpai/0.1 (research)`, 1.2–4 s
apart (about 150 in all), throwaway scripts outside the repo, nothing sent to get past a block.

### 9a. Answer

**No source is good for spirits the way Vivino is for wine.** Open Food Facts is the best of the
general ones (12/20, with ABV and a barcode when it hits), Vivino holds spirits only as sparse
user-entered records (11/20, never a bottle shot, never an ABV), and Wikidata knows the *brand*
for most bottles (13/20) but almost never the *expression* (Dassai 45 vs Dassai 23, Zacapa 23 vs
XO). For sake, **Sakenowa** has every brewery and brand in the sample (5/5) under an open,
free, attribution-only licence — but in Japanese only, at brand level, without images.
Whiskybase and Distiller have no public API and forbid automated access.

| source | gin (5) | rum (5) | sake (5) | whisky (2) | amaro (2) | grappa (1) | **total** | first hit right | clean bottle image | ABV |
|---|---|---|---|---|---|---|---|---|---|---|
| **Open Food Facts** (search-a-licious, then barcode) | 4 | 3 | 1 | 2 | 2 | 0 | **12/20** | 8/20 | 2 of 16 inspected | 7 of 17 records |
| **Vivino** (Algolia `WINES_prod`) | 3 | 3 | 3 | 0 | 1 | 1 | **11/20** | 11/20 | **0/11** | 1/11 (Berta only) |
| **Wikidata** (brand level) | 4 | 4 | 2 | 1 | 2 | 0 | **13/20** | 12/20 | 8 of 13 have a bottle photo | 0 |
| **Wikidata** (the exact expression) | — | — | — | 1 | — | — | 1/20 (+ Lagavulin 16) | | | 0 |
| **Sakenowa** (brand level, kanji) | — | — | **5** | — | — | — | 5/5 sake | 5/5 by exact name | none | none |
| Whiskybase | not reachable: Cloudflare challenge, 403 on every URL incl. `robots.txt` | | | | | | | | | |
| Distiller | no public API; terms forbid automated access (§9f) | | | | | | | | | |

"Found" means the same expression (producer + name, the age statement when the bottle has one);
for Wikidata and Sakenowa, which stop at the brand, it means the brand, and the second Wikidata
row counts the expression.

**The one craft bottle measured, the owner's Hedonya Gin, is on none of the sources** (§9b'):
niche bottles get no record and no image, only wrong candidates.

### 9b. The sample

Twenty bottles an Italian beginner might plausibly own; none is the owner's (his own Hedonya Gin
is in §9b').

| # | Kind | bottle | Vivino | Open Food Facts | Wikidata | notes |
|---|---|---|---|---|---|---|
| G1 | Gin | Hendrick's | yes, 1st (1185152) | yes, 1st (5010327755014: 41.7 %, 0.7 l) | yes (Q5713678, bottle photo) | |
| G2 | Gin | Tanqueray London Dry | yes, 1st (2696988, US "Imported Dry Gin" label) | yes, 1st (5000281015248: 43.1 %) | brand (Q187155, cut-out bottle) | |
| G3 | Gin | Monkey 47 Schwarzwald Dry | no (only a user-entered "Monkey 47 Red") | yes, **3rd** (42213277: 47 %, 500 ml) | brand (Q18862701, empty item) | OFF's 1st is a no-image duplicate (42113277) |
| G4 | Gin | Malfy Con Limone | no | **sibling** (5000299296066 is the *Gin Rosa*) | brand (Q60785137, photo of two bottles) | |
| G5 | Gin | Gin Mare | yes, 1st (2109303) | yes, 1st (8411640000459) | no | |
| R1 | Rum | Ron Zacapa 23 | yes, 1st (4346434 "Sistema Solera 23") | yes, **3rd** (7401005008603; 1st is "Rons", no brand) | brand (Q1266184; its photo *is* the 23) | |
| R2 | Rum | Diplomático Reserva Exclusiva | yes, 1st (1216609, **two duplicates**) | yes, 1st (7594003620059, named just "Diplomatico", 40 %) | brand (Q17638133, photo 215×346) | |
| R3 | Rum | Plantation Original Dark | no | **sibling** (0695521151586 is *3 Stars*, no brand) | no | |
| R4 | Rum | Don Papa | no | **sibling** (Baroko 1st; a 43 % "rhum" 2nd) | yes (Q35026670, bottle photo) | |
| R5 | Rum | Havana Club Añejo 7 | yes, 1st (2121372, typed **red wine**) | yes, **4th** (8501110080453; image 97×200 at full) | brand (Q1411852; its photo *is* the 7) | |
| S1 | Sake | Dassai 45 | no (`Dassai` → Château Dassault) | **sibling** (Dassai 50, no brand) | brand (Q114849273, landscape photo) | Sakenowa: 獺祭, brewery 獺祭, Yamaguchi |
| S2 | Sake | Hakkaisan Tokubetsu Honjozo | **sibling** (Tokubetsu Junmai, typed red wine) | **sibling** (misspelled "Hakkasian" Tokubetsu Junmai) | brewery only (Q11391523) | Sakenowa: 八海山, 八海醸造, Niigata |
| S3 | Sake | Kubota Senju | yes, 1st (1859521 "Senjyu Kubota") | no (Kubota mochi, noodles) | no (the tractor maker) | Sakenowa: 久保田, 朝日酒造, Niigata — no Senju |
| S4 | Sake | Gekkeikan (Traditional) | yes, 1st (1382600 "The finest Sake Gekkeikan") | yes, 1st (21597664: 15.6 %, `en:sake`) | company (Q223215, head-office photo) | Sakenowa: 月桂冠, Kyoto |
| S5 | Sake | Born Gold Junmai Daiginjo | yes, 1st (1675883, "Special Junmai Daiginjo Born": the Gold is not certain) | no | no | Sakenowa: 梵, 加藤吉平商店, Fukui |
| W1 | Whisky | Nikka From the Barrel | no | yes, 1st (two barcodes; 51.4 %) | yes (Q22127157, empty item) | |
| W2 | Whisky | Talisker 10 | no (`Talisker` → Talise wines) | yes, **4th** (5000281005416, "Single Malt Scotch Whisky," 45.8 %) | distillery only (Q278) | |
| A1 | Liqueur and amaro | Amaro Montenegro | yes, 1st (1774848) | yes, 1st (8000330001748, no brand, no ABV) | yes (Q719468, bottle photo) | |
| A2 | Liqueur and amaro | Amaro Averna | no (Averna *Sambuca*, Averna *Limoni*) | yes, 1st (8000400201210 and 8000400203782: 23.2 %, clean cut-out) | yes (Q790615, packaging photo) | |
| P1 | Grappa | Berta Tre Soli Tre | yes, 1st (3234339, winery "Berta", Piemonte) | no (`Berta` → a cheese, a sauce) | an archive record only (Q81166864) | |

The three bottles of §3c add: Lagavulin 16 (Vivino no, OFF yes, Wikidata **yes**: Q96278979
with a bottle photo), Diplomático (as R2), Nonino Tradizione (Vivino yes with a wrong region, OFF
no, Wikidata brand Q7049432 whose photo *is* the Tradizione).

### 9b'. A craft bottle: Hedonya Gin

One bottle the owner actually has, a small Italian gin, measured on its own to see whether niche
bottles are found at all.

| source | query | result |
|---|---|---|
| Vivino | `Hedonya Gin` | **not found** — 1,953 hits, the first five Hendrick's, Tanqueray, Gin Mare, Bulldog, Christian Drouin: the brand word is dropped and *Gin* alone matches. An adapter taking the first hit would store Hendrick's |
| Vivino | `Hedonya` | not found — 4 hits, all wines (*Hedonia* Traminette, *Hedonys*, *Hedonysm*) |
| Open Food Facts | `Hedonya Gin` | **not found** — 632 hits, all other gins with `brands: "Gin"` |
| Open Food Facts | `Hedonya` | 0 hits |
| Wikidata | `Hedonya` (en, it) | 0 items |

**Not found anywhere; no record, no image.** Both searches answer a miss with confident, wrong,
plausible candidates (other gins), so the "producer word must appear in the hit" filter of §9c is
what keeps a craft bottle from being stored as Hendrick's. For such bottles the owner's own text
(and, later, his own photo) is the record; the sources add nothing.

### 9c. Vivino on spirits

- **Spirits are a sliver of the index and all user-entered.** A facet query
  (`{"query":"","hitsPerPage":0,"facets":["type_id"]}`) counts 2,030,946 records: 1 red
  1,005,093 · 2 white 613,797 · 3 sparkling 180,218 · 4 rosé 121,610 · 7 dessert 69,998 ·
  24 fortified 21,740 · **25 (spirits and everything else) 18,490**.
- **Every spirit hit had `winery: null`** except Berta's grappa, `alcohol: 0` except one Berta
  record (44), `region: null`, and an image under `images.vivino.com/labels/…jpg` — a user's
  photo, never a `_pb_` bottle shot (0/11).
- **Types are unreliable.** Havana Club 7, Hakkaisan Tokubetsu Junmai and Tanqueray Export
  Strength are typed 1 (red wine), Hakkaisan Sparkling 3. So `filters` on `type_id` is no fix:
  restricting to non-wine types recovered nothing (Monkey 47, Malfy, Plantation, Don Papa,
  Dassai, Nikka, Talisker, Averna stayed missing) and *lost* Hakkaisan.
- **Misses become confident wrong answers**, as with Rocca Sveva in §2: the index drops words it
  cannot match, so `Monkey 47 Schwarzwald Dry Gin` returns Tanqueray and two Proseccos,
  `Dassai 45` returns Marqués de Riscal, `Nikka From the Barrel` a Zinfandel, `Talisker 10` a
  Brazilian Sauvignon Blanc. The adapter must drop hits whose name shares no word with the
  query's producer.
- **Duplicates.** Diplomático Reserva Exclusiva exists three times (1216609, 2330442, 2824497).

**The key.** vivino.com answered **403 to `kanpai/0.1 (research)` on its home page** today, so the
navigation bundle could not be re-fetched with an honest User-Agent. The key was re-read from the
copy of `/packs/navigation-237f833246a6f87e.js` that the earlier probe (§3a) had saved, and it
still works. A copy of kanpai cannot count on re-deriving it unattended.

### 9d. Open Food Facts on spirits

Endpoints and query rules as in §2 (`search.openfoodfacts.org/search?q=…&langs=it,en`, then
`/api/v2/product/{code}.json`). On spirits:

- **Better than on wine** — 12/20 against 2/14 — because big spirit brands are sold through
  supermarkets, where contributors scan them. Japanese sake (1/5), Italian grappa (0/1) and a
  flavoured variant (Malfy Con Limone) are where it runs out.
- **The right record is often not first** (Monkey 47 3rd, Zacapa 3rd, Havana Club 7 4th,
  Talisker 4th), and siblings come first (Malfy *Rosa*, Plantation *3 Stars*, Don Papa *Baroko*,
  Dassai *50*). Never auto-pick; filter on `brands` containing the producer word and on
  `categories_tags` containing `en:alcoholic-beverages`.
- **What a barcode lookup carries for a spirit**, e.g. `5000281005416`:
  ```
  product_name               "Single Malt Scotch Whisky,"      ← the age is not in the name
  brands                     "TALISKER"
  quantity                   "70cl"
  nutriments.alcohol_value   45.8                               ← on 7 of 17 records read
  categories_tags            [… "en:whisky", "en:scotch-whisky"] (also en:gins, en:rums,
                              en:old-rums, en:sake / en:rice-wines, en:herbal-liqueur)
  image_front_url            ".../500/028/100/5416/front_fr.22.400.jpg"
  ```
  No producer separate from the brand, no age statement, no distillery, no region.
- **Images:** of 16 front images inspected at 200 px, **two are clean** (Averna, a cut-out;
  Tanqueray on a plain shelf). The rest: label close-ups (Hendrick's, Zacapa, Diplomático,
  Gekkeikan), bottles held in a hand (Plantation, Gin Mare), a back label (Don Papa), gift boxes
  (Nikka, Talisker), a kitchen counter (Dassai), a dark room (Montenegro). Licence CC BY-SA, as §2d.
- The image host was slow (10–20 s per file at times) — the adapter should hotlink, never proxy.

### 9e. Wikidata and Wikimedia Commons

| Endpoint | Status | Use |
|---|---|---|
| `GET https://www.wikidata.org/w/api.php?action=wbsearchentities&search=…&language=en&format=json` | 200, **429 after ~15 calls at 1.2 s** | name → item id |
| `GET https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1|Q2|…&props=labels|claims` | 200, up to 50 ids per call | claims |
| `GET https://query.wikidata.org/sparql?query=…` | 200; one query of six failed to return JSON | counts, bulk |
| `GET https://commons.wikimedia.org/w/api.php?action=query&titles=File:…&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=…` | 200 | thumbnail URL, size, licence |

- **It is a brand registry, not a bottle catalogue.** Items are brands (`P31` alcohol brand,
  gin, rum, trademark), companies or distilleries. Expression-level items are rare: of the sample
  only *Nikka from the Barrel* (an item with no claims at all) and, outside it, *Lagavulin 16 years
  whisky* (Q96278979). SPARQL counts: 13 items under gin, 25 under rum, 16 under sake, 56 under
  whisky, 2 under amaro; **1,669 alcohol brands, 799 with an image**.
- **Fields:** `P176` manufacturer (Diageo, William Grant & Sons — the owner, not the distillery),
  `P18` image, `P154` logo, `P856` website, `P17` country. **`P2665` (alcohol by volume) was empty
  on every item read.** No age, no category beyond `P31`.
- **Images:** a Commons photo on 8 of 13 brand hits that is a recognisable bottle (Hendrick's,
  Tanqueray, Malfy, Zacapa, Diplomático, Don Papa, Havana Club, Montenegro; Averna's is its
  packaging), often the flagship expression — Zacapa's is the 23, Havana Club's the 7, Nonino's
  the Tradizione. Others are a distillery, a head office or a landscape. Licences vary per file
  (CC BY 2.0–4.0, CC BY-SA); each needs its own attribution from `extmetadata.Artist`.
  `upload.wikimedia.org` thumbnails (`…/thumb/…/250px-<file>`) answered 200 to the honest UA.
- **Terms:** data CC0; files under their own licences; the
  [User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) asks for contact
  details in the User-Agent, and the 429 here came with a contact-less one.

### 9f. Spirits- and sake-specific sources

**Sakenowa data (さけのわデータ)** — `https://muro.sakenowa.com/sakenowa-data/` — the open data of a
Japanese sake check-in app.

| Endpoint | Status | Contents |
|---|---|---|
| `GET https://muro.sakenowa.com/sakenowa-data/api/brands` | 200, 158 KB, 1.3 s | 3,298 brands `{id, name, breweryId}` |
| `GET …/api/breweries` | 200, 81 KB | 1,745 breweries `{id, name, areaId}` |
| `GET …/api/areas` | 200 | 47 prefectures (+ abroad) `{id, name}` |
| `GET …/api/flavor-charts` | 200 | 1,367 brands × six axes `f1`–`f6` (華やか floral, 芳醇 rich, 重厚 heavy, 穏やか mild, ドライ dry, 軽快 light), 0–1 |
| `GET …/api/rankings`, `…/api/flavor-tags`, `…/api/brand-flavor-tags` | per the docs | monthly ranking; tag ids and per-brand tags |

- **Coverage:** all five sample sakes, by exact name: 獺祭 (887), 八海山 (380), 久保田 (431), 月桂冠
  (1151), 梵 (1948), each with brewery, prefecture and a flavour chart.
- **Limits:** names are **in Japanese only** (no romaji, so `Dassai` matches nothing: the
  assistant over MCP, or the owner, must supply 獺祭); **brand level only** — Dassai 45 and 23,
  Kubota Senju and Manju are all one record; **no images, no ABV, no grade** (junmai, ginjō…).
  The whole dataset is ~250 KB and could be read once and searched locally.
- **Terms** (from the page): free, commercial and non-commercial use, modification allowed; the
  only condition is an **attribution** next to the data with a link to `https://sakenowa.com`
  (e.g. "さけのわデータを利用しています"); not allowed without attribution, or in a way that harms
  Sakenowa's image.

**Whiskybase** — `www.whiskybase.com`, `api.whiskybase.com` and `robots.txt` all answered **403**
with `cf-mitigated: challenge` (a Cloudflare JavaScript challenge) to the honest User-Agent. No
public API documentation exists; its terms, as quoted in search results, exclude commercial use
and downloading the service. Third-party scrapers exist; using one would be exactly what this
research does not do. Not a source.

**Distiller** — `distiller.com` serves pages to the honest User-Agent but `/search` answered 403.
No public API. Its [terms of service](https://distiller.com/terms-of-service) forbid "*data
mining tools or automation tools such as spiders, scrapers, crawlers*" and "*building databases
or otherwise creating permanent copies of content*". Not a source.

**SakeTime / sake-times** — no API found; the host did not answer. Not a source.

### 9g. Recommendation per Kind

| Kind | text search | barcode | image | why |
|---|---|---|---|---|
| Red, White, Rosé, Orange, Sparkling, Sweet, Fortified | Vivino, then Open Food Facts | Open Food Facts | Vivino `bottle_medium` | §7, unchanged |
| **Whisky** | **Open Food Facts**, then Wikidata (brand) | Open Food Facts | Open Food Facts, else Commons | OFF 2/2 (+ Lagavulin) with ABV; Vivino 0/2 |
| **Rum** | **Open Food Facts**, then Vivino | Open Food Facts | Open Food Facts, else Commons | OFF 3/5, Vivino 3/5: they miss different bottles; merge |
| **Gin** | **Open Food Facts**, then Vivino | Open Food Facts | Open Food Facts, else Commons | OFF 4/5 with ABV; Vivino 3/5 without |
| **Grappa** | **Vivino**, then Open Food Facts | Open Food Facts | Vivino user photo | the only hit for Berta (and Nonino) was Vivino's |
| Brandy | Open Food Facts, then Vivino | Open Food Facts | Open Food Facts | not measured; by analogy with whisky |
| **Liqueur and amaro** | **Open Food Facts**, then Vivino | Open Food Facts | Open Food Facts | OFF 2/2, Vivino 1/2 |
| Vodka, Tequila and mezcal, Other spirit | Open Food Facts, then Vivino | Open Food Facts | Open Food Facts | not measured; by analogy with gin and rum |
| **Sake** | **Sakenowa** (local copy, kanji) for brewery, prefecture, flavour; Vivino for the expression | Open Food Facts | Vivino user photo, else none | Sakenowa 5/5 brands; Vivino 3/5; OFF 1/5 |

- **For spirits, merge Open Food Facts and Vivino as candidates**, Open Food Facts first, and
  show nothing as "the" match: siblings and word-dropping misses dominate both.
- **Wikidata is an optional enrichment, not a search**: when a candidate's brand resolves to an
  item, its Commons `P18` can stand in for a missing or ugly image (with the file's own
  attribution), and `P856` gives the official site. It never decides the expression.
- **Sakenowa** fits a small adapter that downloads its ~250 KB once and matches kanji locally; it
  needs an attribution line in the UI wherever its data shows.
- **No spirits-specific source is usable**: the two that hold expression-level spirit data with
  ABV and age (Whiskybase, Distiller) have no API and forbid automated access.

**The Kinds.** The sample was named against the Kinds as `0010_the_kinds_grow.sql` leaves them:
amaro is *Liqueur and amaro*, sake is *Sake*. Vodka, Tequila and mezcal, Vermouth, Beer, Cider
and Mead were not measured.

### 9h. How to re-run

```sh
# Vivino — the Kind distribution of the index
curl -s -A "kanpai/0.1" \
  -H "X-Algolia-Application-Id: 9TAKGWJUXL" -H "X-Algolia-API-Key: <VIVINO_ALGOLIA_KEY>" \
  -d '{"query":"","hitsPerPage":0,"facets":["type_id"]}' \
  "https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query"

# Open Food Facts — a spirit by name, then by barcode
curl -s -A "kanpai/0.1 (you@example.com)" --get "https://search.openfoodfacts.org/search" \
  --data-urlencode "q=Nikka From the Barrel" \
  --data "langs=it,en&page_size=5&fields=code,product_name,brands,categories_tags,image_front_url"
curl -s -A "kanpai/0.1 (you@example.com)" \
  "https://world.openfoodfacts.org/api/v2/product/5000281005416.json?fields=product_name,brands,quantity,nutriments,categories_tags,image_front_url"

# Wikidata — brand search, then claims (keep ≥ 3 s between calls; put a contact in the UA)
curl -s -A "kanpai/0.1 (you@example.com)" \
  "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=Havana%20Club&language=en&format=json"
curl -s -A "kanpai/0.1 (you@example.com)" \
  "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=Q1411852&props=claims&format=json"

# Sakenowa — the whole brand list (Japanese names)
curl -s -A "kanpai/0.1 (you@example.com)" https://muro.sakenowa.com/sakenowa-data/api/brands
```
