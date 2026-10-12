# A Vintage is a year, NV, or unknown

A Vintage is one of three things: **a year**, **NV** (the producer blends years — *Franciacorta
Cuvée Imperiale Brut*, almost every spirit), or **unknown** (the wine has a year and nobody
wrote it down). A Label has at most one NV Vintage and at most one unknown Vintage. Bottles and
Tastings always attach to a Vintage, so the unknown one is where they go when the year is
missing.

The owner's own Vivino history forced it: four of the fourteen Labels in
[`source-sample.md`](../research/source-sample.md) have no year recorded, and none of the four
is a non-vintage wine. Putting them under NV would state something false about the wine —
*this producer blends years* — to cover for something true about the owner — *I didn't look*.
Vivino draws the same line, as N.V. against U.V.

## Consequences

- **Learning the year later is a verb**: it moves the chosen Bottles and Tastings from the
  unknown Vintage to the year's Vintage, creating it if needed. Nothing is re-entered.
- **Scores on the Label count the unknown Vintage like any other**; scores on a Vintage are per
  Vintage, so the unknown one has its own.
- **The assistant records unknown rather than guessing.** A year read off a photograph is a
  year; a year inferred from "it was a few years ago" is not, and the `record_tasting` tool
  says so in its description.
- A spirit Label still has exactly one Vintage, NV (ADR-0002). *Unknown* is for wine.
