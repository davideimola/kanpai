# A bottle is drawn from its Kind

Decided with the owner on 2026-10-12, with the web view's design (S4).

Every Bottle and every Label on the web view is drawn as a **silhouette**: a bottle of a
**shape**, holding a **liquid** of a colour. A closed Bottle is filled; an open one is an
outline with the liquid up to its Level — full, ¾, ½, ¼ (ADR-0007) — so the Cellar can be read
at a glance the way a shelf is.

Both come from the **Kind**, as columns on its row — `kinds.bottle_shape` and `kinds.liquid` —
for the reason `has_vintages` and `first_source` are columns (ADR-0002, ADR-0011): a Kind a
copy's owner adds is drawn by its own row, and nothing in code names a Kind to decide how it
looks. A Red is a Bordeaux holding red, a Sparkling a flute holding white, a Gin a spirit
bottle holding clear, a Sake a sake bottle.

A **Label may override the shape** (`labels.bottle_shape`, `null` for the Kind's): a Riesling
comes in a flute, a craft gin in something squat. It may not override the liquid, because the
liquid is what the Kind *is* — a white in red would be a wrong Kind, not a quirk of the bottle.

The shapes and the liquids are **closed sets held by check constraints**, like a Bottle's
Level: `bordeaux`, `burgundy`, `flute`, `spirit`, `sake`, `beer`; and `red`, `white`, `rose`,
`orange`, `amber`, `clear`. A shape is a drawing in `src/components/silhouette.tsx` and a liquid
a token in `src/app/globals.css`, so a value with no drawing or no colour is refused by the
database rather than drawn as nothing. Growing either is a migration and a drawing together.

## The label image

A Label's image — its Source's (`label_sources.image_url`, hotlinked, ADR-0011) or the owner's
own (`own_image_url`) — is a **recognition aid**, not the picture of record, and it is **not
drawn into the silhouette**: the label rectangle is always plain paper. Cropping the photograph
into it was built first and dropped on 2026-10-12, once seen with real Labels: at the sizes a
shelf draws, the crop read as a smudge, said little, and spoiled the drawing. The whole
photograph is shown on the Label's page alone, small and whole beside the credit and full size
when pressed, credited to its Source (Open Food Facts' images are CC BY-SA: the Source's name
and a link to its page). Where a photograph is what tells two bottles apart — choosing among a Source's
candidates — it is shown whole and small beside each one (S6).

## Consequences

- **The drawing is data the queries return.** The Cellar, the diary and the Label page read
  each Label's shape (its own, else its Kind's), its Kind's liquid and its image (for the Label
  page's photo), so a screen draws without knowing any Kind.
- **A Kind can also be hidden** (`kinds.hidden`). A Kind with Labels is never deleted — the
  foreign key refuses it — so retiring one the owner never uses is hiding it: it leaves every
  list a form or an assistant picks from (`list_kinds` included) and stays on every Label
  already of it. A Kind with no Labels may be deleted.
- No image is ever stored or proxied: an `<image>` inside the SVG reads the hotlinked address,
  as the plain `<img>` of ADR-0011 did.
