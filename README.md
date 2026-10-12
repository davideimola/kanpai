# kanpai

**乾杯** — *kanpai*. The Japanese toast, and literally *"dry the cup"*: finish what is in it.

A single-owner record of wine and spirits — what was drunk and what was thought of it, what is
in the house, what is worth trying — kept in one place so that an **external** sommelier
(ChatGPT, Claude, over MCP) can answer *"what should I open tonight"* without the owner keeping
notes by hand. The sibling of [tsundoku](https://github.com/davideimola/tsundoku), which
catalogues the pile that keeps growing; this one catalogues what was emptied.

The app contains **no LLM and spends no tokens**. The sommelier is the assistant the owner
already pays for.

Read [`CONTEXT.md`](CONTEXT.md) for the vocabulary and [`docs/spec.md`](docs/spec.md) for what
is built and in what order. Every decision lives in exactly one place, its ADR in
[`docs/adr/`](docs/adr/).

> Status: S2, the MCP door. The tables of [`docs/spec.md`](docs/spec.md) §2 migrate from
> scratch, the verbs and queries are in [`src/core`](src/core/README.md), tested against a real
> Postgres, and `/mcp` exposes them to Claude behind tokens the owner issues — create a Label,
> record a Tasting, read the Cellar, from a conversation. The web view is S4. §5 has the build
> order.

## The local loop

**The local loop stays entirely local.** It runs on a Postgres in Docker: no cloud account, no
Google OAuth client and no secret to obtain. What it takes to run the same thing in public is
[running your own copy](#running-your-own-copy), and none of it changes anything below.

Docker must be running.

```sh
mise install                 # the toolchain: node 22, pnpm 10.32.1
pnpm install
cp .env.example .env.local   # DATABASE_URL, and the gate open for local work
pnpm db:up                   # the container, then the schema
pnpm dev                     # http://localhost:3000
```

The page lists the Kinds — Red to Other spirit — read out of Postgres on the request. If you
see them, the whole path — container, migration, core module, gate, page — is connected.

`.env.example` carries `AUTH_DEV_OPEN=true`, which opens the owner gate: there is no Google
OAuth client locally, so without it the loop would end at a sign-in button that cannot work.
It is an **opt-in rather than a fallback** — a gate that opened by itself whenever
`AUTH_GOOGLE_ID` was missing would open the owner's record to anyone the day a variable was
misspelled — and it is **never honoured in a production build**, which the image is. Both
conditions are tested in [`src/lib/auth/gate.test.ts`](src/lib/auth/gate.test.ts).

### DATABASE_URL is the only variable the local loop needs

It carries the host, the port, the credentials and the database name, and everything reads
it: `next dev`, `pnpm db:*` and `pnpm test`. It is also what the container is built from, so
**moving the port is the whole change** — nothing else needs touching.

```sh
# Something already on 5432? tsundoku's own container, or a Postgres on the host.
DATABASE_URL=postgres://kanpai:kanpai@127.0.0.1:5433/kanpai
```

The container is named after the port it publishes — `kanpai-pg` on 5432, `kanpai-pg-5433`
on 5433 — so **two checkouts on two ports never collide**. `pnpm db:up` tells you to do
exactly this if the port it wants is taken.

`pnpm test` uses the same server and its own database, `kanpai_test`, which it creates.
Development data and test data never share a database.

### The commands

```sh
pnpm dev          # http://localhost:3000
pnpm build        # production build (needs no database: the page is per-request)
pnpm db:up        # bring the container up and apply every pending migration
pnpm db:reset     # drop the database and apply the whole schema from scratch
pnpm db:down      # delete the container, and its data with it
pnpm db:psql      # a psql shell inside the container
pnpm db:migrate   # apply pending migrations to whatever DATABASE_URL names
pnpm db:generate  # write the next migration from db/schema.ts
pnpm token:issue <name>   # issue an MCP access token, and print its secret once
pnpm token:list           # every token: name, issued, last used, revoked
pnpm token:revoke <id>    # refuse that token at /mcp from now on
pnpm test         # vitest against a real Postgres, node environment
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check (lint + format), lint:fix to fix
```

### The MCP door

`/mcp` is how Claude reads and writes the record, as the owner's sommelier. It takes **access
tokens the owner issues** — named after where they go, shown once, stored as a hash, revoked
one by one ([ADR-0009](docs/adr/0009-the-mcp-door-takes-tokens-the-owner-issues-and-oauth-comes-later.md)) —
and it **fails closed**: until a token is issued, every request is a 401. There is no
development opt-in: issuing one is a command.

```sh
pnpm token:issue "Claude Code"   # prints kanpai_… once; it is stored only as a hash
pnpm token:list                  # names, last used, revoked
pnpm token:revoke tok_…          # refused from the next request on
```

The web view will issue them from `/settings` (S4); this command calls the same verbs.

**Claude Code**, against the local loop:

```sh
claude mcp add --transport http kanpai http://localhost:3000/mcp \
  --header "Authorization: Bearer kanpai_…"
```

Then `/mcp` in Claude Code lists the tools. *"Had a Barolo Castiglione 2019 by Vietti last
night with a steak, a 4"* searches the catalogue, creates the Label — marked unverified, for
the owner to check — and records the Tasting on its 2019; *"what's in my cellar?"* reads it.

**Claude Desktop** reads local servers from `claude_desktop_config.json` (Settings →
Developer → Edit Config), and its *custom connectors* are reached from Anthropic's side, so a
`localhost` URL is not one of them. Bridge it with
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote), which needs node on the machine:

```json
{
  "mcpServers": {
    "kanpai": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/mcp", "--header", "Authorization:${KANPAI_AUTH}"],
      "env": { "KANPAI_AUTH": "Bearer kanpai_…" }
    }
  }
}
```

The header goes through the environment because some clients split an argument at its space.
Restart Claude Desktop after editing. A copy deployed behind HTTPS is a custom connector on
claude.ai or in the apps instead, with the same header; ChatGPT reaches it through OpenAI's
Secure MCP Tunnel, which presents a token issued for it (S5).

What the tools are, how one is added, and why the assistant creates Labels directly rather than
proposing them, is [`src/lib/mcp/README.md`](src/lib/mcp/README.md).

### Where a page goes

**Every page lives in a route group, and the group is the gate.** A screen over the owner's
record goes in `src/app/(owner)/` and calls `requireOwner()` before it reads anything; a page
outside the gate goes in `src/app/(public)/` *and* is excluded by name in the matcher in
[`src/proxy.ts`](src/proxy.ts). [`src/app/gated.test.ts`](src/app/gated.test.ts) fails when
either half stops being true, because both failures are silent: a page put outside the group
compiles, renders and reads Postgres exactly as intended, and has simply been served to
whoever has the URL.

The proxy is ergonomics — it turns a refusal into the sign-in screen — and `requireOwner()`
in [`src/lib/auth/owner.ts`](src/lib/auth/owner.ts) is the wall. Both ask one pure predicate,
[`src/lib/auth/gate.ts`](src/lib/auth/gate.ts), so they cannot disagree about who the owner
is. A session lasts 90 days counted from the sign-in, not from the last request; the kill
switch is rotating `AUTH_SECRET`.

### Writing a migration

**You do not pick a number, and you do not write the DDL by hand.** Describe the change in
[`db/schema.ts`](db/schema.ts) and let the generator write the file, named for what it does:

```sh
pnpm db:generate --name=a_bottle_has_a_state   # diffs db/schema.ts, writes the next file
pnpm db:generate --custom --name=the_grapes    # an empty file, for rows or hand-written SQL
pnpm db:migrate                                # applies what the database has not seen
```

Then finish it by hand with what Drizzle does not write: every `comment on`, functions like
`gen_prefixed_id()`, and **the vocabularies, which are rows and not schema** — the Kinds are
`0001_the_kinds.sql`, and a new Kind is a new file after it (ADR-0002).
`db/migrations/meta/` is the generator's own state and is committed with the file.

A file is **never edited once it has been applied** — Drizzle keeps a hash per file and
refuses a changed one; `pnpm db:reset` is the answer while a change is still yours alone. If
you rename a generated file, rename its `tag` in `db/migrations/meta/_journal.json` too, and
**never touch the `when`**: the migrator applies only what sorts after the newest `when` a
database has recorded, so one that sorts behind is a migration that never runs anywhere.
[`db/migrations/journal.test.ts`](db/migrations/journal.test.ts) is the wall for both.

## Running your own copy

kanpai is single-owner **per copy**, and anyone may run a copy
([ADR-0008](docs/adr/0008-anyone-runs-their-own-copy-from-a-published-image.md)). There is no
tenancy in the schema and there is not meant to be: a second person runs a second copy.

Every push to main publishes an image to `ghcr.io/davideimola/kanpai`, and
[`compose.yaml`](compose.yaml) runs it as three steps in order — Postgres, the migrations
from the same image, the app — with **no clone, no node and no build**:

```sh
curl -O https://raw.githubusercontent.com/davideimola/kanpai/main/compose.yaml
curl -o .env https://raw.githubusercontent.com/davideimola/kanpai/main/.env.example
# fill in the gate in .env: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_OWNER_EMAIL
docker compose up            # http://localhost:3000
```

From a clone, `docker compose up --build` builds the same image from the source instead.

**The gate is real from the first request.** The image is a production build, so
`AUTH_DEV_OPEN` is never honoured there, and without the four gate variables every visitor —
the owner included — lands on the sign-in screen. They are documented in
[`.env.example`](.env.example); the redirect URI to register with Google is
`https://<your domain>/api/auth/callback/google`, and `AUTH_URL` is that origin. Put the
copy behind a TLS terminator of your own: the container serves plain HTTP on 3000. A
step-by-step for someone who has never made an OAuth client, and GitHub as a second sign-in
provider, arrive with the self-host kit (S9).

**The MCP door needs a token, and a fresh copy has none**, so it refuses every assistant until
its owner issues one. Until the web view can, issue it from inside the running copy:

```sh
docker compose exec app node --experimental-strip-types \
  --disable-warning=MODULE_TYPELESS_PACKAGE_JSON db/token.ts issue Claude
```

`db/token.ts list` and `db/token.ts revoke <id>` work the same way.

**The Sources are Open Food Facts, and Vivino if you turn it on.** A search for a bottle the
catalogue does not have asks Open Food Facts — open data, on by default, `SOURCES_OPENFOODFACTS=false`
turns it off — and, only when you set `VIVINO_ALGOLIA_APP_ID` and `VIVINO_ALGOLIA_KEY`, Vivino's
search index. **Vivino's terms forbid automated access**, so that is your decision for your copy;
the key is not in this repository, may rotate, and kanpai keeps working without it
([ADR-0011](docs/adr/0011-sources-are-asked-by-kind-propose-candidates-and-vivino-is-opt-in.md),
[`.env.example`](.env.example)).

| variable | default | what it does |
|---|---|---|
| `SOURCES_OPENFOODFACTS` | on | `false` makes the copy ask no Source at all |
| `VIVINO_ALGOLIA_APP_ID`, `VIVINO_ALGOLIA_KEY` | unset: Vivino off | both set: Vivino is asked, first for wine, grappa and sake |

**Backups are your job.** The `data` volume is where the record lives, not where it is safe:
`compose.yaml` deliberately has no backup, and a copy worth keeping needs one somewhere else —
`docker compose exec postgres pg_dump -U kanpai kanpai` is the start of one. A backup that has
never been restored is a belief rather than a backup.
