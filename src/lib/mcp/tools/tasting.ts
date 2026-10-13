import { getTasting, listTastings } from "@/core/queries/tasting";
import { Refusal } from "@/core/refusal";
import { editTasting, recordTasting } from "@/core/verbs/tasting";
import { RATING, SEARCH_FIRST, VINTAGE } from "../prose.ts";
import {
  clearableNumberArgument,
  clearableStringArgument,
  type McpTool,
  numberArgument,
  stringArgument,
  VINTAGE_ARGUMENTS,
  vintageArgument,
} from "../tool.ts";

// The Tasting area: the flow this whole app exists for — *had this last night with a steak,
// liked it, a 4* — and the diary read back.
//
// A Tasting is an event and is never overwritten **by another one**: the same wine drunk twice
// is two Tastings. But one Tasting is filled in over a conversation — recorded with a rating,
// then the four guided answers asked one by one — and the answers belong in that same Tasting.
// With no tool to amend one, an assistant (ChatGPT) recorded a second Tasting holding the
// answers: a duplicate the owner could not even remove. So `edit_tasting` amends a Tasting by
// its id, as `editTasting` does (ADR-0003: a correction is an edit of that Tasting, not a new
// one). Striking one stays the owner's, from the web view: nothing on this door deletes.

const record: McpTool = {
  name: "record_tasting",
  title: "Record a Tasting",
  description: `Record one occasion the owner drank something and what they thought of it. A **Tasting** is an
event and never overwrites another: the same wine drunk twice is two Tastings, and the second may
disagree with the first.

**Name what was drunk one of three ways**: \`vintage_id\`; or \`label\` with \`vintage\`; or, for a
**loose** Tasting, only \`description\`. A Tasting may be loose — no Label at all — for *a Primitivo by
the glass at the trattoria*: describe what was known (Kind, grape, region, the place's words) and
record it; what the owner liked counts even when nobody wrote the producer down. Do not create a
Label for a house wine nobody can name.

For a bottle with a label, find it first. ${SEARCH_FIRST}

${VINTAGE}

${RATING}

**The four guided answers** are how a beginner says what they thought: \`liked_it\` (did you like
it?), \`body_and_feel\` (how did it feel in the mouth — light or full, dry, smooth, warm),
\`reminded_of\` (what did it remind you of), and \`food\` (with what food). Ask the ones they have not
answered, then write each up in a sentence of plain words — theirs, not a critic's. \`notes\` is for
anything else.

**Record one Tasting per occasion.** When the answers come after it is recorded, put them into this
same Tasting with \`edit_tasting\` and the id this returns — never record a second Tasting for them.`,
  inputSchema: {
    type: "object",
    properties: {
      ...VINTAGE_ARGUMENTS,
      description: {
        type: "string",
        description: `For a loose Tasting only, instead of a Vintage: what was drunk, as known — "Primitivo by
the glass, house red, Puglia".`,
      },
      tasted_on: { type: "string", description: "The day, `2026-10-11`. Today when left out." },
      place: { type: "string", description: 'Where: "home", "Trattoria da Mario, Bologna".' },
      food: { type: "string", description: "With what food — the fourth guided answer." },
      company: { type: "string", description: "With whom, as the owner said it." },
      rating: {
        type: "number",
        description: "1 to 5 in half steps. Leave it out if they gave none.",
      },
      liked_it: { type: "string", description: "Did they like it, and what about it." },
      body_and_feel: { type: "string", description: "How it felt in the mouth." },
      reminded_of: { type: "string", description: "What it reminded them of." },
      notes: { type: "string", description: "Anything else worth keeping." },
    },
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const vintage = vintageArgument(input);
    const tasting = await recordTasting({
      vintageId: typeof vintage === "string" ? vintage : undefined,
      vintageOf: typeof vintage === "object" ? vintage : undefined,
      description: stringArgument(input, "description"),
      tastedOn: stringArgument(input, "tasted_on"),
      place: stringArgument(input, "place"),
      food: stringArgument(input, "food"),
      company: stringArgument(input, "company"),
      rating: numberArgument(input, "rating"),
      likedIt: stringArgument(input, "liked_it"),
      bodyAndFeel: stringArgument(input, "body_and_feel"),
      remindedOf: stringArgument(input, "reminded_of"),
      notes: stringArgument(input, "notes"),
    });
    return { tasting };
  },
};

const edit: McpTool = {
  name: "edit_tasting",
  title: "Edit a Tasting",
  description: `Change or fill in a **Tasting** already recorded, by its id: the answers to the four guided
questions, the Rating, the day, the place, the food, the company, the notes. **This is how the
answers to the four guided questions reach the Tasting you just recorded**: ask them after
\`record_tasting\`, then write the answers here, with the id \`record_tasting\` returned. **Never
record a second Tasting for the same occasion** — that is a duplicate the owner has to delete by
hand. A new Tasting is only for another time they drank it.

Find the id with \`read_tastings\` when you do not have it. Fields you leave out stay as they are;
\`null\` clears one. **Ask the owner before you overwrite something already written** — read the
Tasting first, and add to their words rather than replacing them unless they asked you to.

\`description\` is for a loose Tasting only (no Label). What a Tasting is on is not changed here.

${RATING}

To remove a Tasting recorded by mistake, tell the owner: deleting one is theirs, from the web view.`,
  inputSchema: {
    type: "object",
    properties: {
      tasting: { type: "string", description: "The Tasting's id, `tst_…`." },
      tasted_on: { type: "string", description: "The day, `2026-10-11`." },
      place: { type: ["string", "null"], description: "Where. `null` clears it." },
      food: {
        type: ["string", "null"],
        description: "With what food — the fourth guided answer. `null` clears it.",
      },
      company: { type: ["string", "null"], description: "With whom. `null` clears it." },
      rating: {
        type: ["number", "null"],
        description: "1 to 5 in half steps. `null` clears it.",
      },
      liked_it: {
        type: ["string", "null"],
        description: "Did they like it, and what about it. `null` clears it.",
      },
      body_and_feel: {
        type: ["string", "null"],
        description: "How it felt in the mouth. `null` clears it.",
      },
      reminded_of: {
        type: ["string", "null"],
        description: "What it reminded them of. `null` clears it.",
      },
      notes: { type: ["string", "null"], description: "Anything else. `null` clears it." },
      description: {
        type: "string",
        description: "For a loose Tasting only: what was drunk, as known.",
      },
    },
    required: ["tasting"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const id = stringArgument(input, "tasting");
    if (id === undefined) throw new Refusal("invalid", "Name the Tasting by its id, `tst_…`.");
    const changes = {
      tastedOn: stringArgument(input, "tasted_on"),
      place: clearableStringArgument(input, "place"),
      food: clearableStringArgument(input, "food"),
      company: clearableStringArgument(input, "company"),
      rating: clearableNumberArgument(input, "rating"),
      likedIt: clearableStringArgument(input, "liked_it"),
      bodyAndFeel: clearableStringArgument(input, "body_and_feel"),
      remindedOf: clearableStringArgument(input, "reminded_of"),
      notes: clearableStringArgument(input, "notes"),
      description: stringArgument(input, "description"),
    };
    if (Object.values(changes).every((value) => value === undefined)) {
      throw new Refusal("invalid", "Say what to change: at least one field besides `tasting`.");
    }
    await editTasting(id, changes);
    return { tasting: await getTasting(id) };
  },
};

const read: McpTool = {
  name: "read_tastings",
  title: "Read the Tastings",
  description: `The owner's **Tastings**, newest first, each with its \`id\` (what \`edit_tasting\` takes): when,
where, with what and whom, the **Rating** (1 to 5 in halves) and what they thought — the four guided
answers and the notes — with the Label and Vintage each was on. Loose Tastings (a glass with no Label) are here too, with their \`description\` and no
Label.

Every filter is optional and they combine. A Kind filter leaves loose Tastings out, because they have
no Kind; region and grape also look in a loose Tasting's description.

This is what to read for *"why did I like that one?"* and *"what do I usually like?"* — the prose, not
only the numbers.`,
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", description: "A Kind's id from `list_kinds`, e.g. `kind_red`." },
      region: {
        type: "string",
        description: 'A region or appellation, accents and case folded: "chianti".',
      },
      grape: { type: "string", description: 'A grape, accents and case folded: "sangiovese".' },
      min_rating: {
        type: "number",
        description: "Only Tastings rated at least this; unrated ones are left out.",
      },
      from: { type: "string", description: "The first day, `2026-01-01`, included." },
      to: { type: "string", description: "The last day, included." },
    },
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return {
      tastings: await listTastings({
        kindId: stringArgument(input, "kind"),
        region: stringArgument(input, "region"),
        grape: stringArgument(input, "grape"),
        minRating: numberArgument(input, "min_rating"),
        from: stringArgument(input, "from"),
        to: stringArgument(input, "to"),
      }),
    };
  },
};

export default [record, edit, read];
