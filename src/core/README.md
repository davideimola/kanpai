# The core module

One core, and every door over it. The web view and — from S2 — the MCP route handler are
**thin adapters over this module**, and none of them holds domain logic (ADR-0001, on
tsundoku's stack). That is what makes a single test seam cover every surface, and it is the
rule to break last.

```
src/core/
├── db.ts            the pool, and the only file that knows what a pool is
├── transaction.ts   how a verb that is several writes stays one
├── refusal.ts       what a verb throws when the database says no
├── typed.ts         what was typed, on its way to a column: trimmed, a day, a price
├── sources/         the outside catalogues the app asks: Open Food Facts, Vivino (ADR-0011)
│   ├── candidate.ts  http.ts  openfoodfacts.ts  vivino.ts  configured.ts  fixtures/
├── queries/         one file per question the app answers
│   ├── kind.ts  label.ts  tasting.ts  cellar.ts  wish.ts  palate.ts  access-token.ts
│       catalogue.ts
└── verbs/           one file per area of writing
    └── label.ts  vintage.ts  source.ts  bottle.ts  tasting.ts  wish.ts  palate.ts  kind.ts
        access-token.ts  catalogue.ts
```

## There is no index

Import the file, not a barrel:

```ts
import { listKinds } from "@/core/queries/kind";
```

`src/core/index.ts` does not exist and should not be created. Slices add verbs and queries to
this directory in parallel; a barrel would be the one file every one of them has to edit, and
every merge would conflict in it. Importing the file directly costs nothing and conflicts with
nobody.

For the same reason: **add a file rather than widening one.** A new question about Tastings
goes in `queries/tasting.ts`, not into `queries/kind.ts`. Files are named after the area they
answer for, in the vocabulary of `CONTEXT.md` — `label.ts`, `tasting.ts`, `bottle.ts`,
`cellar.ts` — never after a layer (`helpers.ts`, `utils.ts`, `service.ts`).

**A question that crosses areas is named after the question.** `search_catalogue` will ask our
Labels first and the Sources after (spec §3): put in `label.ts` it would be a Label query
reaching outside the house. So a cross-entity question gets a file named after what it asks,
and both doors call it, so neither can reach a record the other cannot.

## What belongs here, and what does not

- **Here**: the verbs, the queries, and the SQL. Derivations are queries, not stored
  columns, and they are the product — the Cellar out of the Bottles' States, a Label's
  latest and average score out of its Tastings.
- **Not here**: anything about HTTP, sessions, headers, React or MCP framing. Those belong
  to the adapter that has them. The **access tokens** the MCP door takes are here, because
  they are records the owner issues, names and revokes (ADR-0009) and both doors reach them —
  `/mcp` to check one, `/settings` to issue one. Reading one out of an `Authorization` header
  is not: that is `src/lib/mcp/bearer.ts`.
- **One exception, and it is outbound: `sources/`.** That rule is about the door a request
  arrives through. A Source the app *asks a question of* — Open Food Facts, Vivino
  (ADR-0011) — is the other direction, a dependency of the model like the pool. So it sits
  beside `db.ts`, as HTTP adapters that know nothing of Postgres, and **it is taken as an
  argument** by every query and verb that asks one (`searchCatalogue(sources, …)`,
  `createLabelFromSource(sources, …)`). `sources/configured.ts` is the one place that builds
  them from the environment, and only a door calls it: a test hands in Sources that answer
  from `sources/fixtures/`, so no test calls a third party, and nothing on a page render
  calls one either — a Source is asked on an explicit search and nowhere else.
  `sources/candidate.ts` says what every Source returns: **candidates**, never a match.
- **Not here either**: invariants that Postgres can enforce. The database refuses what must
  never be true rather than trusting this module to remember, so a rule that can be a
  constraint should be a constraint in a migration, not an `if`. *A Kind's section is never
  blank* is `kinds_section_is_not_blank`, not a check in `kind.ts`.

Everything in here is `server-only`. `DATABASE_URL` must never reach a browser bundle, and
the import makes an accidental client import a build error.

## Reads

A query is an exported `async function` returning plain data, with a type beside it. Return
the shape the screen and the MCP tool actually want — this module answers questions, it does
not expose tables.

A plain read of a table goes through `db()` and the typed schema, as `listKinds` does. A
derivation is SQL through `query`, and every value reaches it as a parameter:

```ts
return query<Bottle>("select … from bottles where vintage_id = $1", [vintageId]);
```

Never by building a string. It is the whole reason SQL injection is not something this repo
has to think about.

**A Kind is data, so no type here enumerates them** (ADR-0002). `Kind` carries a `name` that
is a `string`, never a union of eleven literals: a twelfth Kind is an insert, and a union
would quietly make it a deployment.

## Writes

**Every write is a named verb**, in the owner's words: `createLabel`, `mergeLabels`,
`setVintageYear`, `recordTasting`, `strikeTasting`, `openBottle`, `closeWish`. There is no
generic update and no `save()`. One file per area in `verbs/`, one exported `async function`
per verb, and the consequences named in its doc comment.

**One verb is one transaction.** A verb that is several statements runs them through
`transaction()`, and a verb another verb composes — `ensureVintage` — takes where to run as its
last argument. Composing two verbs in a caller invents a transaction that does not exist.

**When the database says no**, the verb wraps the statement in `refusing()` and writes the prose
the owner reads; what comes out is a `Refusal` with a stable code — `already-exists`,
`not-found`, `not-allowed`, `invalid` — and the name of the rule that refused. It is mapped from
the SQLSTATE, never from a message, and a trigger names its rule with `using constraint = …`
exactly as a check does, so the two reach a door the same way. Nothing above `src/core` sees a
`pg` error; anything that is not a `Refusal` is a bug and stays one.

## Tests

Seam 1, against a real Postgres: `queries/kind.test.ts` sits beside `queries/kind.ts`.
`pnpm test` brings the database up and applies the schema itself — see the README's local
loop. The adapters get no tests of their own, and there are no rendering, component or
browser tests anywhere in this repo.
