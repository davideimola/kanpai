# kanpai is its own app, on tsundoku's stack

kanpai is a **separate application and a public repository**, not a second bounded context
inside tsundoku. It copies tsundoku's stack and its load-bearing decisions rather than
reinventing them: Next.js with Postgres on the owner's cluster, Drizzle for the migrations, the
web view gated by Google restricted to one address, the **MCP server as a route in the same
app**, and **no LLM inside the app** — the sommelier is the assistant the owner already pays for
(tsundoku ADR-0002, ADR-0004).

tsundoku's ADR-0006 left exactly this door open — *non-reading collections would arrive as a
second bounded context* — and the cheapest reading of it was to put the wine inside tsundoku:
one deploy, one login, one MCP endpoint. The owner chose a separate app instead: a different
subject with its own name and identity, which someone else can fork without inheriting a
library.

## Consequences

- **The maintenance cost is real and accepted.** A third app means its own image, secrets,
  backups and dependency updates. Copying tsundoku's shape exactly is what keeps that cost low:
  a fix found in one applies to the other by the same diff.
- **The repo carries no personal data and no secret.** The owner's Tastings live in the
  cluster's Postgres; the repo is forkable as is.
- **The interface is in English**, with `CONTEXT.md` as its copy deck, like the siblings.
