# Sources are asked by Kind, propose candidates, and Vivino is the copy owner's opt-in

Supersedes ADR-0006. Decided with the owner on 2026-10-12, from the measurement in
[`docs/research/sources.md`](../research/sources.md).

There are still two Sources, **Open Food Facts** and **Vivino**, behind one adapter, and images
are still hotlinked. What changes is the order they are asked in, what they are allowed to do
with an answer, and who decides whether Vivino is asked at all.

## What forced it

ADR-0006 put Open Food Facts first and Vivino as the fallback, before anything was measured.
The measurement found it backwards for wine and right for spirits: on the owner's fourteen wines
Vivino found **14** and Open Food Facts **2**, with three confident false positives (a mineral
water for *Rocca Sveva*, flour for *Farina*, *Campofiorin* for *Brolo* Campofiorin); on twenty
spirits Open Food Facts found 12, with a barcode and often a strength, and Vivino 11, all of them
user-entered records with no bottle shot and no strength. It also found that Vivino's terms do
not merely "not invite" this use, as ADR-0006 put it — they forbid automated access in so many
words — and that the endpoint worth using is not vivino.com's but the Algolia index its search
box queries.

## What it decides

**The order is the Kind's** — a column on the row, `kinds.first_source`, so a Kind a copy's
owner adds is routed by its own row (ADR-0002):

| Kind | by name | by barcode | image |
|---|---|---|---|
| Red, White, Rosé, Orange, Sparkling, Sweet, Fortified; Grappa | Vivino, then Open Food Facts | Open Food Facts | Vivino's |
| Whisky, Gin, Rum, Vodka, Tequila and mezcal, Brandy, Liqueur and amaro, Other spirit | Open Food Facts, then Vivino, merged | Open Food Facts | Open Food Facts' |
| Sake | Vivino for the bottle, then Open Food Facts | Open Food Facts | Vivino's |
| Vermouth, Beer, Cider, Mead | **not measured**: routed like the spirits, Open Food Facts first | Open Food Facts | Open Food Facts' |

A search with no Kind asks both and interleaves them, Vivino first. A barcode goes to Open
Food Facts alone: it is the only Source that reads one, and a barcode names a Label exactly. The
image is whichever the chosen candidate carries. Sake brewery and flavour data from
[Sakenowa](https://muro.sakenowa.com/sakenowa-data/) — open, attribution-only, Japanese only,
brand level (§9f) — is a later addition and is not built.

**A Source proposes; it never picks.** What a Source returns is a list of **candidates**, and
the owner or the assistant chooses one. Nothing takes the first hit: Vivino puts the right
Valpolicella third behind two of a namesake's, and both Sources answer the owner's craft
*Hedonya Gin* with Hendrick's, Tanqueray and Gin Mare, matching on *gin* alone. So **a candidate
that shares no word with the producer or brand the search named is discarded** before anyone
sees it — the producer when it is given apart from the name, otherwise the query's words that
are not a Kind's name. For a bottle no Source knows, the Label is created from what the owner
says, with no Source, and that is the right record rather than a lesser one.

**A chosen candidate is read again from its Source** — Vivino by `filters=id=<id>`, Open Food
Facts by the barcode — rather than from what the assistant passes back, and the Label is created
with its Source in one transaction. What the owner (or the assistant, from the bottle) states
alongside wins over what the Source says; a Source never overwrites the owner (`CONTEXT.md`,
**Source**). ~~The Label is born unverified, as every Label the assistant creates (ADR-0004).~~
*Amended 2026-10-12:* the Label is born **checked**, whichever door made it — the Source's
identifying facts are already right, and the to-check list is for what the assistant read off a
photo or a conversation (ADR-0004, amended).

**Vivino is opt-in and off by default.** It is turned on by its copy's owner, by setting
`VIVINO_ALGOLIA_APP_ID` and `VIVINO_ALGOLIA_KEY` in the environment; with either missing it is
off, and the search says so. Said plainly, because every copy's owner is making this call for
themselves:

- **Vivino's [terms of service](https://www.vivino.com/legal/terms-of-service) forbid
  automated access** "*through automated means, scraping tools, crawlers, or bots*" and the
  circumvention of access controls. A copy that sets the key is using Vivino outside its terms,
  and that is its owner's decision, not this repository's. The default copy asks only Open Food
  Facts, whose terms invite it.
- **Only the Algolia endpoint is used** (`<app id>-dsn.algolia.net/1/indexes/WINES_prod/query`),
  with the search-only key Vivino ships in its own pages. vivino.com's `/api/*` is never called:
  it sits behind a firewall that refuses an honest User-Agent, and **no browser User-Agent is
  ever sent** to get past it — that would be the circumvention the terms name. Every request
  carries `kanpai/<version> (+https://github.com/davideimola/kanpai)`.
- **The key is never committed** — not in code, not in `.env.example`, not in a fixture or a
  research note. It is Vivino's, and it **may rotate** at any deploy of theirs.
- **When Vivino fails or is off, kanpai works**: with Open Food Facts and the owner's own
  description. A refused key, a timeout or an error page is reported as *Vivino unavailable*,
  which says nothing about the bottle, and the search returns what Open Food Facts said.

**Images are hotlinked, as before** — the address is stored in `label_sources.image_url`, the
bytes never are, and the page shows them with a plain `<img>`:

- From Vivino, `image.variations.bottle_medium` when the record lists one (a studio bottle shot),
  else the variation it does list. A bottle-shot address is **never constructed** for a record
  that has none: S3 answers those with 403.
- From Open Food Facts, `image_front_url`. Its images are **CC BY-SA** and its data **ODbL**, so
  wherever one is shown the Source is credited — *Open Food Facts* linking the record's
  `page_url` — which `label_sources.source` and `page_url` are enough to render. A candidate
  carries the credit as `attribution`.

**Recognising a label from a photograph inside the web app is dropped.** Browser OCR resolved 1
of 7 real phone photos, and Vivino's recognition exists only in its apps. The ways in are the
phone's own text scan (Live Text, and its Android equivalents) into the ordinary search box; a
barcode; and a photo sent to the assistant over MCP, which reads the label with its own vision
and searches. Spec §7's open question is settled this way.

## Consequences

- **Turning Vivino on is two variables, and a rotated key is an environment change** —
  [`.env.example`](../../.env.example) says where the key is found and why it is not there.
- **Every search says which Sources were consulted, which are off and which did not answer**,
  so an assistant never reads a Source's silence as *no such bottle*.
- **`search_catalogue` and `create_label` reach the open world**, and say so in their
  `openWorldHint`; every other tool reaches only this copy's database.
- **No test calls a Source.** The adapters are tested against recorded, trimmed answers with no
  header and no key in them; one live smoke test runs only when asked for by hand.
- ADR-0008's `SOURCES_VIVINO=true` is replaced by the two Algolia variables; Open Food Facts can
  be turned off too, with `SOURCES_OPENFOODFACTS=false`, for a copy that should make no
  outbound call.
