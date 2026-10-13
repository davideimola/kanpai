# kanpai — implementation spec

What to build, and in what order. **It does not restate decisions**: each one lives in its ADR
in [`docs/adr/`](adr/), and the vocabulary lives in [`CONTEXT.md`](../CONTEXT.md). This
document is the inventory and the build order.

> **Status: draft.** Written from the first design conversation (2026-10-12). Section 7 lists
> what is still open. Built so far: S0, S1, S2, S3, S4, S6, S7.

---

## 1. What kanpai is

A **single-owner** record of wine and spirits — what was drunk and what was thought of it, what
is in the house, what is worth trying, and the owner's Palate — so that Claude or ChatGPT, over
MCP, can act as the owner's sommelier. The owner is a beginner; the assistant also teaches.

Same stack and same shape as tsundoku ([ADR-0001](adr/0001-kanpai-is-its-own-app-on-tsundokus-stack.md)):
one Next.js app on the cluster over Postgres, Drizzle migrations, **three doors over one
`src/core`** — the owner's web view (Google, one address), `/mcp` (tokens the owner issues, the
ChatGPT tunnel, OAuth later — [ADR-0009](adr/0009-the-mcp-door-takes-tokens-the-owner-issues-and-oauth-comes-later.md)), and nothing
else for now. **No LLM inside the app, no tokens spent.**

Single-owner **per copy**, and anyone can run a copy from the published image with
`docker compose up` ([ADR-0008](adr/0008-anyone-runs-their-own-copy-from-a-published-image.md)).

## 2. The data

Tables: `kinds` · `labels` · `vintages` · `label_sources` · `bottles` · `tastings` · `wishes` ·
`palate` (one row) · `access_tokens`. Prefixed text ids, as in the siblings.

Every id is `gen_prefixed_id('<prefix>')` — `kind_`, `lbl_`, `vtg_`, `src_`, `btl_`, `tst_`,
`wish_`, `tok_` — except the Palate's, which is the constant `palate`. The invariants are held by
Postgres, not by `src/core`: the constraint or trigger named beside each is what refuses it.

- `kinds`: name, section, `has_vintages`, sort order, `first_source` — the Source a search by
  name asks first (`vivino` for wine, grappa and sake; `openfoodfacts`, the default, for the
  rest), `bottle_shape` and `liquid` — how a Label of it is drawn (`bordeaux` | `burgundy` |
  `flute` | `spirit` | `sake` | `beer`; `red` | `white` | `rose` | `orange` | `amber` | `clear`) —
  and `hidden`, which leaves it out of every list a form or an assistant picks from; a Kind with
  Labels is hidden, never deleted (the foreign key refuses it). Rows, not an enum
  ([ADR-0002](adr/0002-one-model-for-wine-and-spirits-and-kind-is-data.md),
  [ADR-0011](adr/0011-sources-are-asked-by-kind-propose-candidates-and-vivino-is-opt-in.md),
  [ADR-0012](adr/0012-a-bottle-is-drawn-from-its-kind.md)).
- `labels`: producer (nullable: a Label read off a photo may not have one), name, kind, country,
  region, appellation, `grapes` (an array: the grapes of a wine or the base of a spirit), age
  statement, strength (% ABV), `unverified`, `own_image_url`, `bottle_shape` (the Kind's
  silhouette overridden for this Label, `null` for the Kind's), created at. A Label always has a
  Vintage (`labels_have_a_vintage`, checked at commit); it cannot move to a Kind without
  vintages while it has a year or an unknown (`labels_kind_without_vintages_keeps_only_nv`).
- `vintages`: label, `dating` (`year` | `nv` | `unknown`) and `year`, present exactly when
  dated by year — one year per Label, at most one NV and one unknown per Label; a Label whose
  Kind has no vintages (`kinds.has_vintages = false`: spirits, beer, sake) has exactly one, NV
  (`vintages_of_a_kind_without_vintages_are_nv`) ([ADR-0010](adr/0010-a-vintage-is-a-year-nv-or-unknown.md),
  [ADR-0002](adr/0002-one-model-for-wine-and-spirits-and-kind-is-data.md),
  [ADR-0003](adr/0003-a-label-has-vintages-and-the-rating-belongs-to-the-tasting.md)).
- `label_sources`: label, source (`openfoodfacts` | `vivino`), `id_at_source` (the source's id,
  unique per source across all Labels), image URL (hotlinked), page URL, looked-up-at. The
  source and the page are the credit an Open Food Facts image needs (CC BY-SA)
  ([ADR-0011](adr/0011-sources-are-asked-by-kind-propose-candidates-and-vivino-is-opt-in.md)).
- `bottles`: vintage, state (`closed` | `open` | `finished`), level (`full` | `3/4` | `1/2` |
  `1/4`, present exactly when open), bought on (a date), price, where bought, opened at,
  finished at — the dates follow the state, and a finished Bottle cannot be deleted
  (`bottles_finished_is_kept`) ([ADR-0007](adr/0007-a-bottle-has-a-state-and-an-open-one-has-a-level.md)).
- `tastings`: vintage **or** a free description, exactly one ([ADR-0005](adr/0005-a-tasting-may-have-no-label.md)),
  tasted on (a date), place, food, company, rating (1–5 in halves, optional), notes, the guided
  answers `liked_it`, `body_and_feel`, `reminded_of` — the fourth, *with what food*, is `food` —
  created at, edited at.
- `wishes`: label **or** vintage, exactly one, why, `came_from`, created at, closed-as
  (`bought` | `tasted` | `dropped`) and closed-at, which go together.
- `palate`: one row, id `palate`, prose (empty until written), updated at. A second row is
  refused by its id's check, and removing the one by a trigger.
- `access_tokens`: the credentials `/mcp` accepts ([ADR-0009](adr/0009-the-mcp-door-takes-tokens-the-owner-issues-and-oauth-comes-later.md)) —
  name (not blank, unique among the live ones: `access_tokens_name_is_unique_while_live`),
  `secret_hash` (the SHA-256 of the secret in hex, never the secret; unique), created at,
  last used at (touched at most once a minute), revoked at. A revocation is final and a
  token keeps its secret (`access_tokens_revoked_is_final`, `access_tokens_secret_is_final`);
  a row is revoked, never deleted. The secret is `kanpai_` + 32 random bytes in base64url,
  shown once. Meant to hold OAuth's access tokens too (S10), which add their columns then.

## 3. The MCP tools

Thin adapters over `src/core`. The assistant **searches before it creates**, and creates
directly, marking the Labels it writes from what it read unverified
([ADR-0004](adr/0004-the-mcp-creates-labels-directly-and-marks-them-unverified.md)).

| tool | does |
| --- | --- |
| `search_catalogue` | our Labels first, then the Sources' **candidates** with images, in the order the Kind names (Vivino first for wine, grappa and sake; Open Food Facts first for the rest; interleaved without a Kind); by text, with an optional `producer` and `kind`, or by `barcode` (Open Food Facts alone, and our Labels holding it). Candidates sharing no word with the producer are discarded; the answer says which Sources were consulted, off or unavailable, and that a candidate is to be confirmed (S3) |
| `get_label` | one Label with its Vintages, Bottles, Tastings and derived scores |
| `create_label` | from a chosen candidate (`source` + `id_at_source`, re-read from the Source by id and recorded with its image and page; what the caller states wins over the Source), born checked; or from what was read off a photo or said, born unverified |
| `list_kinds` | the Kinds, with their ids — what `create_label` is created against (added in S2) |
| `record_tasting` | on a Vintage, or loose with a description |
| `add_bottles` | n Bottles of a Vintage into the Cellar |
| `update_bottle` | open, set level, finish |
| `set_vintage_year` | move Bottles and Tastings from the unknown Vintage to a year |
| `read_cellar` | what is in the house, with levels |
| `read_tastings` | filtered by Kind, region, grape, rating, date |
| `add_wish` / `read_wishes` / `close_wish` | the wishlist (`read_wishes` added in S2: a Wish is closed by its id) |
| `read_palate` / `update_palate` | the prose Palate |

`record_tasting` and `add_bottles` name their Vintage by id, or by a Label and a dating — a
year, `nv` or `unknown` — which finds that Vintage or creates it in the same transaction. The
door, its gate and its rules are [`src/lib/mcp/README.md`](../src/lib/mcp/README.md).

## 4. The surfaces

| route | what it is |
| --- | --- |
| `/` | the diary, in two views (`?view=wine`), both filtered by section and by a search (`?q=`) that finds, every word typed, accents and case folded, a Tasting by its Label's name, producer, appellation, region, country, grapes and Kind, a loose Tasting's description, and its food, place, company, notes and guided answers — a search that finds nothing says so and offers to clear it. **By day**, the default: Tastings, newest first, by day, each with its rating ring and its bottle drawn from its Kind ([ADR-0012](adr/0012-a-bottle-is-drawn-from-its-kind.md)); at the desk, the open bottles beside it. **By wine**: each Label drunk, once — its last rating, how many times it was tasted and when, what is left of it in the Cellar — most recently drunk first or by rating (`?sort=rating`), opening its page; a Label with finished Bottles and no Tasting is listed too, so a bottle drunk with nothing recorded does not vanish, and the loose Tastings come last under their own heading, one row each (ADR-0005) |
| `/cellar` | the Cellar, one shelf per section (not per Kind), each Bottle drawn — closed full, open with its level; an open Bottle stands alone, closed ones of a Vintage stand together with a count; filtered by Everything, Open, or a section |
| `/labels/<id>` | one Label: Vintages, Bottles, Tastings, derived scores, Sources and their credit, the photo, when there is one, shown small and whole beside the Source's credit and full size when pressed (never drawn into the bottle); edit (every field, the Kind and the bottle shape), merge, record a Tasting, add Bottles, open / set the level / finish / delete a Bottle that is not finished, set the year of the unknown Vintage, mark as checked |
| `/add` | one field searches the catalogue (`?q=`): a name or a producer — the phone's own text scan types into it — or a barcode, typed or read by the camera (`src/components/scan.tsx`, tsundoku's, the one script on the page). **Already yours** first, each with what the Cellar holds of it and Record a tasting / Add bottles; then **Found on** each Source, each candidate with its photo small and whole, to **Choose**; a Source that is off or did not answer says so in a line. A bottle no Source knows is **written in** by hand. Choosing or writing asks the Kind and the year, makes the Label — born checked (ADR-0004, amended) — and lands on its page with Record a tasting or Add bottles open |
| `/wishlist` | the open Wishes, newest first, each with its Label drawn, the year when it names a Vintage, why, where the idea came from and when it was added; **Bought** closes it and opens the Label's Add bottles, **Tasted** closes it and opens Record a tasting — each panel saying so, with an undo — and **Drop** closes it with an undo on the list. The closed ones apart (`?show=closed`), with how each ended, and can be put back. A Wish is added from a Label's page (**Add to the wishlist**, with why and where the idea came from) or from `/add`, as the third way on after Choose or Write it in; a Label already wished for says so instead of taking a second |
| `/palate` | the Palate, read and rewritten in place: saving replaces the whole prose, as `update_palate` does, and says when it last changed. Empty, it says what a Palate is for and what is worth writing in one. Beside it, quietly, what the diary rated 4 or more has in common — Kinds, grapes, regions, counted in Tastings, only what two or more share — to help write it; the assistant reads the Palate, not that |
| `/to-check` | Unverified Labels, oldest first: open, edit, merge or mark as checked |
| `/settings` | as in the siblings, plus **access tokens**: issue (shown once), name, last used, revoke; and **Kinds**: add, rename, reorder, move to a section, set its bottle shape and liquid, hide one in use (a Kind with Labels is never deleted; one with none may be) |
| `/signin` | as in the siblings |
| `/healthz` | outside the gate, for whatever runs the image: `select 1` within two seconds, `200 ok` or `503 unavailable`, never cached and never why |

Installable as a PWA (manifest and icons outside the gate), dark and light following the system.

The navigation is one list (`src/app/(owner)/navigation.ts`): at the desk a rail with the mark
and Diary, Cellar, Add, Wishlist, Palate, To check, Settings; on a phone a bottom bar — Diary,
Cellar, a round Add in the middle, Wishlist, Palate — with To check (and how many wait) and
Settings in the header. **A destination is listed only once its screen exists**: Add came with
S6, and the Wishlist and the Palate with S7, which completed the bar.

## 5. Build order

| # | slice | done when |
| --- | --- | --- |
| **S0** | **Scaffold** copied from tsundoku: `mise.toml`, Next.js, Drizzle, the `db` CLI, Biome, Vitest, the owner gate with `AUTH_DEV_OPEN`, the Dockerfile, `compose.yaml`, and CI that publishes the image to GHCR | `pnpm db:up && pnpm dev` shows the Kinds read from Postgres; `docker compose up` does the same from the published image, after signing in (a production image never honours `AUTH_DEV_OPEN`) |
| **S1** | **Schema and core verbs** | the tables of §2 migrate from scratch; verbs tested against a real Postgres |
| **S2** | **The MCP door** with issued tokens (first one from a CLI command until the web view exists), the tools of §3 minus Sources | from Claude Code / Claude Desktop locally: create a Label by hand, record a Tasting, read the Cellar |
| **S3** | **Source research, then the adapter** — measure Open Food Facts and Vivino on ~30 Labels the owner actually drank, as tsundoku measured covers | a research note in `docs/research/` ([`sources.md`](research/sources.md)) and [ADR-0011](adr/0011-sources-are-asked-by-kind-propose-candidates-and-vivino-is-opt-in.md); `search_catalogue` returns candidates with images, routed by Kind, from Open Food Facts and — where the copy's owner turned it on — Vivino, degrading to our Labels when a Source is off or does not answer; `create_label` makes a Label from a chosen candidate with its Source recorded |
| **S4** | **Web view: diary, Cellar, Label page, to-check** | the owner can see and correct what the assistant wrote |
| **S5** | **Go live on the cluster** — domain, Google client, bearer, backups | ← **first usable version: a photo in the Claude app on the phone records a Tasting** |
| **S6** | **Add from the web** — text search (the phone's text scan fills it), barcode scan (tsundoku's `scan.tsx`) | a bottle bought at the shop is added without opening a chat |
| **S7** | **Wishlist and Palate pages** | both readable and editable from the web |
| **S8** | **Import the Vivino history** | past Tastings and ratings are in, attached to Labels |
| **S9** | **The self-host kit** — *Running your own copy* in the README, `.env.example` with every variable explained, the GitHub sign-in provider, connector guides for Claude and ChatGPT, the sommelier prompt | someone who is not the owner goes from nothing to a working copy following the README alone |
| **S10** | **OAuth 2.1 for MCP** — discovery, dynamic client registration, consent behind the owner sign-in, PKCE, refresh, revocation | ChatGPT connects to a copy with no tunnel; built when a copy other than the owner's needs it |

## 6. Out of scope for now

Community ratings and reviews · prices and where to buy · accounts or tenancy (a second person runs a second copy) · translations · an LLM inside the app ·
storing third-party images · a cellar map with racks and positions.

## 7. Open questions

- **Label photo in the web app — settled: dropped** ([ADR-0011](adr/0011-sources-are-asked-by-kind-propose-candidates-and-vivino-is-opt-in.md)).
  Browser OCR resolved 1 of 7 real phone photos, and Vivino's recognition exists only in its
  apps ([`sources.md`](research/sources.md) §5). The ways in are the phone's own text scan into
  the search box, a barcode, and a photo sent to the assistant over MCP, which reads the label
  with its own vision.
- **ChatGPT — settled, recorded here until it gets its ADR.** Same two paths as tsundoku, no
  OAuth server: Claude reaches `/mcp` over the public Ingress with the bearer; ChatGPT, which
  cannot present a bearer, reaches the same `/mcp` through OpenAI's **Secure MCP Tunnel** — the
  cluster's existing `tunnel-client` (`davideimola/cluster`, `apps/tunnel-client`), which was
  built to front several MCP servers through named channels. kanpai is a **second channel**
  there, not a second tunnel. To check at S5: the deployment is configured today with a single
  `MCP_SERVER_URL`, so adding a channel may change how it is configured. For other people's
  copies, the self-host kit (S9) documents the tunnel as the ChatGPT path.
- **The owner's own photos.** `labels.own_image_url` is in the schema and nothing writes it
  yet. Hosting the owner's photos — a bottle no Source knows, a craft gin, the label as it
  really looked — is the one image kanpai would store rather than hotlink (ADR-0011). Open:
  where the bytes live (a volume beside the app, S3-compatible storage on the cluster, or
  Postgres), how a photo reaches it (the web view's `/add`; over MCP an assistant holds the
  photo but cannot hand over a file, so probably not from there), and whether a self-hosted
  copy needs it on day one. Not before S6.
- **The Vivino import (S8).** The official export is thin (no ratings, no reviews); the owner's
  public profile may be the better source. To be measured.
- **Domain.** Proposed `kanpai.davideimola.dev`.
- **The assistant project.** Like tsundoku's `docs/assistant-projects/`, a prompt for the Claude
  and ChatGPT project that sets the sommelier's tone: simple explanations for a beginner, the
  four guided questions after every Tasting, keep the Palate current.
