# kanpai

A single-owner record of what was drunk, what is in the house and what is worth trying —
wine and spirits — kept in one place so that an **external** reader (ChatGPT, Claude, over
MCP) can act as the owner's sommelier: answer *"what should I open tonight"*, *"what should I
buy"*, *"why did I like that one"* without the owner keeping notes by hand.

The owner is a beginner. The vocabulary below is deliberately small, and every word in it is
one the interface shows.

## Language

**Label**:
One thing a producer bottles and sells under one name, independent of the year: *Barolo
Castiglione, Vietti*; *Lagavulin 16*; *Franciacorta Brut, Ca' del Bosco*. It is the unit of the
catalogue and the thing a search, a scan or a photograph resolves to. It carries the producer,
the name, the **Kind**, the region and appellation, the grapes or the base, and — for a spirit —
the age statement and the strength, because those do not change from one bottling year to
the next.
A Label is created the moment the owner (or the assistant) names one the catalogue does not
know yet, and it is born **unverified** when the assistant created it (ADR-0004).
_Avoid_: wine (it names one Kind, and a spirit is a Label too), product, item, reference.

**Kind**:
What a Label is, under a **section** that is the general heading: *Wine* (red, white, rosé,
orange, sparkling, sweet, fortified, vermouth), *Spirits* (whisky, rum, gin, vodka, tequila and
mezcal, grappa, brandy, liqueur and amaro), *Sake, beer and more* (sake, beer, cider, mead). Two
levels and no deeper: anything more specific — Champagne, Barolo, an Islay malt — is the
Label's appellation, region or grapes. It is **stored as data, not as an enum in code**, so a
copy's owner adds or renames one without a migration (ADR-0002).
_Avoid_: type, category.

**Vintage**:
One year of a Label: *Barolo Castiglione 2019*. Bottles and Tastings attach here, not to the
Label, because two years of the same wine are two different things to drink and to keep.
A Vintage is **a year**, **NV** or **unknown** (ADR-0010). **NV** means the producer blends years
— almost every spirit, a non-vintage sparkling — and such a Label has exactly one Vintage.
**Unknown** means the wine has a year and nobody wrote it down; it is where a Tasting or a
Bottle goes until the year is learned, and then they are moved to it. Never use NV to mean
*I don't know*.
_Avoid_: year (as a noun for the record), release, batch; U.V. and N.V. in the interface —
spell them out.

**Source**:
An external catalogue a Label was found in, recorded with that source's own id and page:
**Open Food Facts** first, **Vivino** as fallback (ADR-0006). A Source is where the bottle image
and the identifying facts came from; it is never the owner of the record — the catalogue is
ours, and a Source may not overwrite what the owner corrected.
_Avoid_: supplier, provider, API.

**Tasting**:
One occasion the owner drank something: when, where, with what food, with whom, and **what they
thought of it**. It is an event, never overwritten — the same Vintage drunk twice is two
Tastings, and the second one may disagree with the first.
A Tasting **may have no Label at all** (ADR-0005): *a Primitivo by the glass at the trattoria* is
a Tasting with a free description — Kind, grape, region, whatever was known — because what the
owner liked counts even when nobody wrote the producer down. Such a Tasting can be attached to a
Label later, if one turns up.
_Avoid_: drink, check-in, review (a review is what a Tasting may *contain*).

**Rating**:
What the owner thought, **on a Tasting**, never on the Label (ADR-0003). One to five, in half
steps, plus the owner's own words. A Label's or a Vintage's score is *derived* from its
Tastings — the latest and the average are both shown, because a wine that delighted at dinner
and disappointed three years later is information for the sommelier, not noise.
The owner's words may be the four guided answers (liked it? / body and feel / what it reminded
you of / with what food) rather than prose; the assistant writes them up.
_Avoid_: score (for the record), stars, review.

**Bottle**:
One physical bottle the owner has had in the house. It belongs to a Vintage and has a **State**:
*closed*, *open*, *finished*. An open Bottle has an approximate **Level** — full, ¾, ½, ¼ —
because a spirit stays open for months and the sommelier needs to know what is actually left
(ADR-0007). A finished Bottle is kept, not deleted: it is history.
Opening a wine Bottle usually means it is finished the same evening; the interface makes that
one press.
_Avoid_: item, stock, inventory line.

**Cellar**:
The Bottles in the house that are *closed* or *open*. Not a table — a view. It answers *"what
can I drink tonight"*.
_Avoid_: inventory, collection.

**Wish**:
A Label (or a Vintage) the owner wants to try or buy, with a note on why and where it came from:
*the assistant suggested it*, *a friend*, *seen at the wine shop*. A Wish is closed when it is
bought (it becomes a Bottle) or tasted (it becomes a Tasting), or dropped.
_Avoid_: wishlist item, to-buy.

**Palate**:
The owner's taste, written in prose: what they like, what they don't, what they are curious
about, what they want to spend. **It is an instruction to the external sommelier, not a note to
self**, so it is readable and writable over MCP. The assistant proposes updates to it as
Tastings accumulate; the owner can edit it directly.
_Avoid_: profile, preferences, taste profile.

**Unverified**:
A mark on a Label the assistant created and the owner has not looked at yet. It does not hide
the Label or block anything — a Tasting on it is recorded in full — it only lists it on the
owner's to-check page.
_Avoid_: draft, pending, proposed (nothing is waiting for approval: ADR-0004).

## Relationships

- A **Label** has one **Kind**, one or more **Vintages**, zero or more **Sources**.
- A **Vintage** has zero or more **Bottles** and zero or more **Tastings**.
- A **Tasting** has at most one **Vintage**, and carries its **Rating**.
- The **Cellar** is the Bottles whose State is not *finished*.
- A **Wish** points at a Label or a Vintage.
- There is one **Palate**.

## Example dialogue

> **Owner (from a photo, in the Claude app):** "Had this last night with a steak. Liked it, a bit
> dry in the mouth, tasted like dark fruit. 4."
> **Assistant:** reads the label as *Barolo Castiglione 2019, Vietti*; searches the catalogue;
> finds the Label; records a Tasting on the 2019 Vintage with a Rating of 4 and the notes
> written up; mentions that "dry in the mouth" is what tannins feel like.

> **Owner:** "What should I open on Saturday? Fish."
> **Assistant:** reads the Cellar and the Palate; suggests the closed Vermentino rather than
> the open Islay whisky.
