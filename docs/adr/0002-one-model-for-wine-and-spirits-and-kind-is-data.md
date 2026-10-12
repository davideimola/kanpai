# One model for wine and spirits, and Kind is data

Wine and spirits share one model — **Label → Vintage → Bottle / Tasting** — separated by a
**Kind** stored as a row, not as an enum in code. The fields that only one Kind uses (age
statement and strength for a spirit; appellation for a wine) are nullable columns on the Label.

The differences are real but they are differences of *degree*: a spirit has no year, so it has
one NV Vintage (ADR-0003) — and so do a beer and a sake, which is why the fact belongs to the
Kind, as its `has_vintages`, and not to a list of Kinds called spirits; a spirit stays open for
months, so a Bottle has a Level (ADR-0007).
Neither needs a second model, and two models would double every verb, every MCP tool and every
screen for a collection that is, for now, mostly wine.

## Consequences

- A beer, a sake or a vermouth is a new Kind row, not a migration.
- The interface may show or hide fields by Kind; the database does not enforce which fields a
  Kind may fill, beyond *a Label whose Kind has no vintages has exactly one Vintage, NV* — read
  off the Kind's `has_vintages`, so spirits, beer and sake all follow it without being named.
