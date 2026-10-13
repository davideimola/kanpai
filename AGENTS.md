# kanpai

## Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root, and `docs/spec.md` for what is
built and in what order. Read `CONTEXT.md` before naming anything: every word the interface
shows is defined there, with the words to avoid beside it. If your work contradicts an ADR,
say so explicitly rather than overriding it silently.

## The application

### Stack and local loop

Next.js, TypeScript, Tailwind, shadcn, Biome, Vitest, Drizzle for the migrations, and a
Postgres in Docker driven by one variable — tsundoku's stack, copied on purpose (ADR-0001) so a
fix found in one applies to the other by the same diff. `README.md` has the commands, the
migration convention and the owner gate.

### Where code goes

Every door — the web view, and from S2 the MCP route handler — is a thin adapter over
`src/core`, and none of them holds domain logic. Read `src/core/README.md` before adding a
verb or a query: it says which file yours goes in, and why there is no barrel index to edit.

### Where an MCP tool goes

**In `src/lib/mcp/tools/<area>.ts`, default-exported; the route and `tools.ts` are never
edited.** A tool is a thin adapter over one verb or query, named as spec §3 names it, with a
closed schema and all three hints. A tool that may lead to a new Label spends `SEARCH_FIRST`,
and one that names a Vintage spends `VINTAGE`, from `src/lib/mcp/prose.ts` — never its own
wording of them (ADR-0004, ADR-0010). `src/lib/mcp/tools.test.ts` is the wall, and
`src/lib/mcp/README.md` has the rest.

### Where a page goes

**`src/app/(owner)/`, and it calls `requireOwner()` before it reads anything.** The route
group is the owner gate; a page outside it is a page served to anyone with the URL. A Server
Function or route handler inside it calls the wall too, because a layout does not run for
either. `src/app/gated.test.ts` fails when any of that stops being true.

OAuth's consent screen is the one gated page outside it, in `src/app/(consent)/` (ADR-0013):
gated exactly like `(owner)`, a group of its own only so it is not drawn inside the shell.

A page outside the gate is two deliberate acts: the file goes in `src/app/(public)/` **and**
its path is excluded by name in the matcher in `src/proxy.ts`. `src/proxy.matcher.test.ts` pins
every exclusion, and the exclusions are paths, never prefixes — `/api` in particular is not
excluded as a whole.

### Where a Kind goes

**In a migration, as a row** (ADR-0002). A beer, a sake or a vermouth is a new file written
with `pnpm db:generate --custom --name=…` that inserts into `kinds`; it is never a union of
names in TypeScript, an `if` on a Kind's id, or an edit to `0001_the_kinds.sql`. Nothing about
a Kind is closed: the one fact the model turns on — whether a Label of it has years, or exactly
one Vintage, NV (ADR-0010) — is the row's own `has_vintages`, and its heading is its `section`.

### Where an id comes from

**`gen_prefixed_id('<prefix>')`, as every table's default** — `kind_`, and in S1 one prefix per
table. An id says what it is in every log line and every result an assistant reads back; never
reach for a bare UUID or a serial.

### Where a migration goes

**`db/schema.ts` first, then `pnpm db:generate --name=<what it does>`**, then finished by hand
with what Drizzle does not write: `comment on`, functions, rows. Never edit a file that has
been applied, never hand-write a `when` in the journal; `db/migrations/journal.test.ts` is the
wall. The README's *Writing a migration* has the whole convention.

### Where a colour goes

**`src/app/globals.css`, and nowhere else.** A handful of grey primitives and one hue, declared
on both grounds, with every shadcn token an alias over them. A screen names no colour: it
spends the tokens. The palette is a placeholder until the visual direction is chosen; the only
literals outside it are the ones a tab, a status bar and a manifest need, because those are
outside the cascade (`src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/icon.svg`).

### Where configuration goes

**In the environment, and documented in `.env.example` with no value** (ADR-0008). Anyone may
run a copy from the published image, so nothing about the owner's own deployment — domain,
cluster, secrets, backups — lives in this repository, and every new knob is a variable a
self-hoster can read about in `.env.example`. A build never needs a database or a secret:
every gated page is per-request.

### Tests

Two seams, stated in `vitest.config.ts`: the core's verbs and queries against a real Postgres,
and the owner gate at the HTTP edge. No rendering, component or browser tests, and no test
calls a third party. `pnpm test` is the whole command on a clean clone with Docker running.

### Committed content

Everything committed — code, comments, docs, interface copy — is in English, in
`CONTEXT.md`'s vocabulary.
