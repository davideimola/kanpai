# A Label has Vintages, and the Rating belongs to the Tasting

The catalogue has two levels: the **Label** (what the producer sells under one name) and the
**Vintage** (one year of it, or NV). Bottles and Tastings attach to the Vintage. The **Rating
lives on the Tasting**, never on the Label or the Vintage; their scores are derived.

This is the grain Vivino and CellarTracker both use, and for the same reason: two years of the
same wine are different to drink and to keep, and the same bottle tastes different at three
years and at eight. A rating on the Label would be overwritten every time the owner changed
their mind, and the change of mind is exactly what an external sommelier can use.

## Consequences

- A Label always has at least one Vintage; a Label with no year has exactly one, **NV**.
- "What did I think of this wine" is a query (latest and average over its Tastings), not a field.
- A Tasting never overwrites another; correcting a Tasting that was entered wrong is an edit of
  that Tasting, not a new one.

## Amended 2026-10-13: both doors edit a Tasting, and only the web view strikes one

The edit verb existed, and nothing called it: the MCP door could only record, and the web view
had no Edit. So an assistant (ChatGPT) that recorded a Tasting and then asked the four guided
questions, as the server's instructions tell it to, recorded the answers as a **second Tasting**
— exactly what this ADR rules out — and the owner had no way to remove the duplicate.

Now `edit_tasting` amends a Tasting over MCP, and the server's instructions and
`record_tasting` say the guided answers go into the same Tasting with it. The web view edits a
Tasting and deletes one recorded by mistake — on its Label's page, and in the diary for a loose
one — asking first, in a panel. Striking stays the owner's alone: no MCP tool deletes.
