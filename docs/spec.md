# kanpai — implementation spec

What to build, and in what order. **It does not restate decisions**: each one lives in its ADR
in [`docs/adr/`](adr/), and the vocabulary lives in [`CONTEXT.md`](../CONTEXT.md). This
document is the inventory and the build order.

> **Status: draft.** Written from the first design conversation (2026-10-12). Section 7 lists
> what is still open.

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
`palate` (one row) · `access_tokens` ([ADR-0009](adr/0009-the-mcp-door-takes-tokens-the-owner-issues-and-oauth-comes-later.md): name, hash, created, last used, revoked). Prefixed text ids, as in the siblings.

Every id is `gen_prefixed_id('<prefix>')` — `kind_`, `lbl_`, `vtg_`, `src_`, `btl_`, `tst_`,
`wish_` — except the Palate's, which is the constant `palate`. The invariants are held by
Postgres, not by `src/core`: the constraint or trigger named beside each is what refuses it.

- `kinds`: name, section, `has_vintages`, sort order. Rows, not an enum
  ([ADR-0002](adr/0002-one-model-for-wine-and-spirits-and-kind-is-data.md)).
- `labels`: producer (nullable: a Label read off a photo may not have one), name, kind, country,
  region, appellation, `grapes` (an array: the grapes of a wine or the base of a spirit), age
  statement, strength (% ABV), `unverified`, `own_image_url`, created at. A Label always has a
  Vintage (`labels_have_a_vintage`, checked at commit); it cannot move to a Kind without
  vintages while it has a year or an unknown (`labels_kind_without_vintages_keeps_only_nv`).
- `vintages`: label, `dating` (`year` | `nv` | `unknown`) and `year`, present exactly when
  dated by year — one year per Label, at most one NV and one unknown per Label; a Label whose
  Kind has no vintages (`kinds.has_vintages = false`: spirits, beer, sake) has exactly one, NV
  (`vintages_of_a_kind_without_vintages_are_nv`) ([ADR-0010](adr/0010-a-vintage-is-a-year-nv-or-unknown.md),
  [ADR-0002](adr/0002-one-model-for-wine-and-spirits-and-kind-is-data.md),
  [ADR-0003](adr/0003-a-label-has-vintages-and-the-rating-belongs-to-the-tasting.md)).
- `label_sources`: label, source (`openfoodfacts` | `vivino`), `id_at_source` (the source's id,
  unique per source across all Labels), image URL, page URL, looked-up-at
  ([ADR-0006](adr/0006-sources-are-open-food-facts-then-vivino-and-images-are-hotlinked.md)).
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

## 3. The MCP tools

Thin adapters over `src/core`. The assistant **searches before it creates**, and creates
directly, marking new Labels unverified
([ADR-0004](adr/0004-the-mcp-creates-labels-directly-and-marks-them-unverified.md)).

| tool | does |
| --- | --- |
| `search_catalogue` | our Labels first, then Open Food Facts, then Vivino; returns candidates with images |
| `get_label` | one Label with its Vintages, Bottles, Tastings and derived scores |
| `create_label` | from a Source candidate or from what was read off a photo; born unverified |
| `record_tasting` | on a Vintage, or loose with a description |
| `add_bottles` | n Bottles of a Vintage into the Cellar |
| `update_bottle` | open, set level, finish |
| `set_vintage_year` | move Bottles and Tastings from the unknown Vintage to a year |
| `read_cellar` | what is in the house, with levels |
| `read_tastings` | filtered by Kind, region, grape, rating, date |
| `add_wish` / `close_wish` | the wishlist |
| `read_palate` / `update_palate` | the prose Palate |

## 4. The surfaces

| route | what it is |
| --- | --- |
| `/` | the diary: Tastings, newest first, with bottle images |
| `/cellar` | the Cellar, by Kind; open bottles show their level |
| `/labels/<id>` | one Label: Vintages, Bottles, Tastings, derived scores, Sources; edit, merge |
| `/add` | search the catalogue (text, barcode, label photo — see §7) → record a Tasting or add Bottles |
| `/wishlist` | open Wishes |
| `/palate` | the Palate, editable |
| `/to-check` | Unverified Labels |
| `/settings` | as in the siblings, plus **access tokens**: issue (shown once), name, last used, revoke |
| `/signin` | as in the siblings |

Installable as a PWA (manifest and icons outside the gate), dark and light following the system.

## 5. Build order

| # | slice | done when |
| --- | --- | --- |
| **S0** | **Scaffold** copied from tsundoku: `mise.toml`, Next.js, Drizzle, the `db` CLI, Biome, Vitest, the owner gate with `AUTH_DEV_OPEN`, the Dockerfile, `compose.yaml`, and CI that publishes the image to GHCR | `pnpm db:up && pnpm dev` shows the Kinds read from Postgres; `docker compose up` does the same from the published image, after signing in (a production image never honours `AUTH_DEV_OPEN`) |
| **S1** | **Schema and core verbs** | the tables of §2 migrate from scratch; verbs tested against a real Postgres |
| **S2** | **The MCP door** with issued tokens (first one from a CLI command until the web view exists), the tools of §3 minus Sources | from Claude Code / Claude Desktop locally: create a Label by hand, record a Tasting, read the Cellar |
| **S3** | **Source research, then the adapter** — measure Open Food Facts and Vivino on ~30 Labels the owner actually drank, as tsundoku measured covers | a research note in `docs/research/`; `search_catalogue` returns images |
| **S4** | **Web view: diary, Cellar, Label page, to-check** | the owner can see and correct what the assistant wrote |
| **S5** | **Go live on the cluster** — domain, Google client, bearer, backups | ← **first usable version: a photo in the Claude app on the phone records a Tasting** |
| **S6** | **Add from the web** — text search, barcode scan (tsundoku's `scan.tsx`), label photo per §7 | a bottle bought at the shop is added without opening a chat |
| **S7** | **Wishlist and Palate pages** | both readable and editable from the web |
| **S8** | **Import the Vivino history** | past Tastings and ratings are in, attached to Labels |
| **S9** | **The self-host kit** — *Running your own copy* in the README, `.env.example` with every variable explained, the GitHub sign-in provider, connector guides for Claude and ChatGPT, the sommelier prompt | someone who is not the owner goes from nothing to a working copy following the README alone |
| **S10** | **OAuth 2.1 for MCP** — discovery, dynamic client registration, consent behind the owner sign-in, PKCE, refresh, revocation | ChatGPT connects to a copy with no tunnel; built when a copy other than the owner's needs it |

## 6. Out of scope for now

Community ratings and reviews · prices and where to buy · accounts or tenancy (a second person runs a second copy) · translations · an LLM inside the app ·
storing third-party images · a cellar map with racks and positions.

## 7. Open questions

- **Label photo in the web app.** The owner wants Vivino's flow — photograph the label, not the
  barcode — inside `/add`. Without an LLM inside the app the options are: OCR in the browser
  (e.g. Tesseract.js) feeding the text search, free but weak on stylised labels; Vivino's own
  image recognition, if it exposes one; or a vision model call per scan, which costs cents and
  breaks *no tokens spent*. To be decided after S3, with real labels.
- **ChatGPT — settled, recorded here until it gets its ADR.** Same two paths as tsundoku, no
  OAuth server: Claude reaches `/mcp` over the public Ingress with the bearer; ChatGPT, which
  cannot present a bearer, reaches the same `/mcp` through OpenAI's **Secure MCP Tunnel** — the
  cluster's existing `tunnel-client` (`davideimola/cluster`, `apps/tunnel-client`), which was
  built to front several MCP servers through named channels. kanpai is a **second channel**
  there, not a second tunnel. To check at S5: the deployment is configured today with a single
  `MCP_SERVER_URL`, so adding a channel may change how it is configured. For other people's
  copies, the self-host kit (S9) documents the tunnel as the ChatGPT path.
- **The Vivino import (S8).** The official export is thin (no ratings, no reviews); the owner's
  public profile may be the better source. To be measured.
- **Domain.** Proposed `kanpai.davideimola.dev`.
- **The assistant project.** Like tsundoku's `docs/assistant-projects/`, a prompt for the Claude
  and ChatGPT project that sets the sommelier's tone: simple explanations for a beginner, the
  four guided questions after every Tasting, keep the Palate current.
