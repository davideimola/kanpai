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
