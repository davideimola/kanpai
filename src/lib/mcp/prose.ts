// What several tools have to say the same way, said once.
//
// Each of these is an instruction an assistant reads in a tool's description and acts on, and
// each is one that, worded more weakly in one tool than in another, reopens the failure it
// exists to prevent. tsundoku learned it with duplicates: the door had every read tool needed
// to avoid one, and assistants created them anyway until *search first* was one sentence spent
// by every tool that creates. So the tools here import these rather than paraphrasing them,
// and a new tool that creates a Label or names a Vintage spends the same words.
//
// Not a tool area: it lives beside `tools/` rather than in it, so the directory stays exactly
// the tool list (`./tools.ts`).

/**
 * Search before creating a Label, and what a duplicate costs (ADR-0004).
 *
 * Not *duplicates are bad* — an assistant reads that as a policy — but what actually happens
 * to the owner: nothing waits for their approval, so a second Label for one wine is a real
 * record, with Tastings and Bottles split across two, until they find it and merge it.
 */
export const SEARCH_FIRST = `**Search before you create, every time.** \`search_catalogue\` is the call: search the
words read off the label *and* the words the owner used — the producer, the name, the appellation —
because the Label is often already there written another way (*Fattoria le Corti* and *Principe
Corsini* are one estate). An absence you did not look for is not an absence.

**What a duplicate costs.** A Label you create is real at once: nothing waits for the owner's approval,
it is only marked unverified until they look at it. So a second Label for a wine they already have
splits its Tastings, its Bottles and its score across two records, the sommelier — you — reads half
of the history, and the owner has to notice it and merge the two by hand.`;

/**
 * Which Vintage a Bottle or a Tasting goes on, and the one mistake to never make (ADR-0010).
 */
export const VINTAGE = `A **Vintage** is a year (\`2019\`), \`"nv"\` or \`"unknown"\`. **Use \`"unknown"\`, never \`"nv"\`, when the
year isn't known** — a year read off the label or the photo is a year; one inferred from "it was a
few years ago" is not, and is \`"unknown"\`. **\`"nv"\` only when the producer blends years**: almost
every spirit, a non-vintage sparkling. A Label whose Kind has no vintages (spirits, beer, sake) has
exactly one Vintage, NV, and refuses a year.`;

/** The Rating, and where it belongs (ADR-0003). */
export const RATING = `A **Rating** is the owner's, of this one occasion: 1 to 5 in half steps (\`3.5\`), or left out
when they gave none. Never invent one from their words, and never average it in yourself: a
Label's score is derived from its Tastings.`;

/**
 * What a Source's candidate is, and what it is not (ADR-0011).
 *
 * Every Source measured answers a bottle it does not know with confident, plausible, wrong
 * records — asked for the owner's craft *Hedonya Gin*, both proposed Hendrick's. So the two
 * tools that touch candidates say the same thing about them: a candidate is a proposal to
 * confirm, and a bottle no Source knows is created from what the owner says.
 */
export const CANDIDATES = `**A candidate is a proposal, never a match.** Open Food Facts and Vivino answer a bottle they do not
know with a plausible wrong one — a famous gin for a small one, a sibling wine for the one asked — and
the first candidate is wrong often enough. **Never take the first candidate on trust**: compare the
producer, the name and the image with what the owner has in front of them, and ask when it is not
plain. A candidate whose \`label\` is set is already in this catalogue: use that Label. **For a craft
bottle no Source knows, create the Label from what the owner says**, with no Source — that is the
right record, not a lesser one.`;
