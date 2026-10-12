# The brand: the mark, the colours, the faces

**Two rings, the ones a wine glass and a spirit glass leave on a table.** 乾杯 is *dry the
cup*, and what is left of a cup once it is dry is the ring under it. One ring is wine, one is
spirit, and they overlap because the app keeps both in one place (ADR-0002). There is a drop
beside them because somebody always spills.

The direction was chosen on 2026-10-12 out of four (the toast, the rings, the seal, the
bottle) and their crossings; the rings won for being the least literal and the one that holds
at 16 px.

## The two drawings

| Drawing | Files | Where |
| --- | --- | --- |
| **The stain** — translucent rings, rim darker than the body as a real stain dries, the overlap mixing, the drop | `mark-stain.svg`, `mark-stain-dark.svg` | large: the sign-in screen, the README, anything over ~64 px |
| **The solid** — opaque rings, linked: the spirit passes over the wine at the top and under it at the bottom | `mark.svg`, `mark-dark.svg` | small: the favicon (`src/app/icon.svg`, both grounds in one file), the app icon, anything a stain would turn to mush |

The lockups (`lockup-light.svg`, `lockup-dark.svg`) are the stain beside the word, with 乾杯
after it in the accent. Their type is live text named in a fallback stack, so a machine
without the face draws them in its own serif; `png/lockup-*.png` are the same lockups rendered
in the real face, and the ones to hand to anything that is not a browser.

`png/` holds the rest of the rasters, at 1024 px: both drawings on a transparent ground, and
the app icon on paper and on glass. `src/app/apple-icon.png` is the paper one at 512, mark
across 62% of the tile so Android's circular crop never reaches it.

**Nothing derives these from one geometry yet**, unlike tsundoku's pile: the rings are four
circles each, and the numbers are copied between the files. If the mark changes, change every
file under `docs/brand/` and `src/app/icon.svg`, then re-render the PNGs (headless Chrome over
the SVGs did it the first time).

## The colours

Four named after what they are, each with its dark-ground twin. The mark spends the two
accents; the interface spends them sparingly, and never as decoration.

| Name | Light | Dark | What it is |
| --- | --- | --- | --- |
| **Paper** | `#EDEFE8` | `#17201E` | the ground: a cool, faintly green label paper, not cream |
| **Glass** | `#1F2A27` | `#E6E8E1` | the ink: the green-black of a bottle |
| **Wine** | `#5E1B2D` | `#CF6E88` (text) · `#9A3B57` (a button) · `#B04A63` (mark) | wine, and the app's one action colour |
| **Spirit** | `#C27C1E` (mark) · `#9A5F12` (text) | `#D69238` | whisky, rum, the amber of anything distilled |

Wine and spirit are also how a Label's section is told apart at a glance — a red, a white and
a sparkling are all *wine* here; a grappa and a gin are both *spirit*. Every text use above
clears 4.5:1 on its own ground; the brighter mark values do not and are kept off text.

The interface's tokens are in [`src/app/globals.css`](../../src/app/globals.css), built from
these: paper at three depths, glass at two volumes, two rules, wine, spirit, and the refusal.
The status-bar colours in `src/app/layout.tsx` and the manifest are Paper, stated again
because a status bar is outside the cascade.

## The faces

- **Zen Old Mincho** for the word, the headings and the names of things — a Label's name,
  a producer, a year. A Japanese Mincho whose Latin is a sturdy old-style serif, so *kanpai*
  and 乾杯 sit in one face.
- **Zen Kaku Gothic New** for everything you read to use: buttons, fields, notes, lists.
  The Mincho's sans sibling from the same foundry, so the two share proportions without
  being the same face.

Both are loaded by `next/font` in `src/app/layout.tsx` with the Latin subset only; 乾杯 falls
back to the system's Mincho (Hiragino on Apple), which is a near match.

## What the brand is not

Cream and terracotta, a black page with one acid accent, gold foil, a wine-shop serif in
italics, grapes, vine leaves. Each was the obvious answer and each would make kanpai look
like something else.
