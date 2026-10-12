# The MCP creates Labels directly, and marks them unverified

When the assistant reads a label the catalogue does not know, it **creates the Label and its
Vintage directly** and records the Tasting in the same call. The new Label is marked
**Unverified** until the owner looks at it from the web view. Nothing waits for approval.

This deliberately departs from tsundoku's ADR-0005, where the assistant may only *propose*
entities through an Inbox. There, a hallucinated title becomes a permanent fact in a carefully
curated library and the highest-value flow (*"finished volume 23, an 8"*) touches existing
entities. Here the highest-value flow is the opposite: *a photo at a restaurant table, a bottle
nobody has catalogued yet*. An Inbox would leave that Tasting dangling until the owner got home,
which is the friction the owner rejected every alternative app for.

## Consequences

- **Errors enter the catalogue and are fixed afterwards.** The Unverified list on the web view is
  where that happens; merging two Labels that turn out to be the same is a verb the owner has.
- The assistant must **search before it creates** (the `search_catalogue` tool returns our
  Labels before external Sources), so duplicates are the exception, not the rule.
- A Label found in a Source arrives with that Source's identifying facts and image; one the
  assistant typed in from a photograph arrives with what it read, and nothing else.

## Amended 2026-10-12: only what the assistant wrote itself is unverified

Decided with the owner while building `/add` (S6). **A Label made from a Source's candidate is
born checked**, whichever door made it — `create_label` given `source` and `id_at_source`, or
*Choose* on `/add` — because the Source's identifying facts are already right, and putting them
on the to-check list only made the list noise. **A Label the owner writes in by hand on `/add`
is born checked too**: the owner has looked at it by writing it. Only a Label **the assistant
writes from what it read off a photo or was told in a conversation** — a craft gin no Source
knows — is born unverified, and that is what the to-check list is for.

`createLabelFromSource` holds the rule, so no door can pass it otherwise; `createLabel` still
takes `unverified` from its caller, the door that knows who is writing.
