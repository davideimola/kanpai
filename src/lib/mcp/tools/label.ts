import { getLabel } from "@/core/queries/label";
import { Refusal } from "@/core/refusal";
import { createLabel } from "@/core/verbs/label";
import { SEARCH_FIRST, VINTAGE } from "../prose.ts";
import {
  datingArgument,
  type McpTool,
  numberArgument,
  stringArgument,
  stringsArgument,
} from "../tool.ts";

// The Label area: one Label read whole, and a Label created from a conversation.
//
// **The assistant creates Labels directly** (ADR-0004), which is where this door parts from
// tsundoku's Inbox: the flow that matters is a photo at a restaurant table of a bottle nobody
// has catalogued, and a Tasting left waiting for the owner to get home is the friction they
// rejected every other app for. What stands in for the Inbox is two things: the Label is born
// **unverified**, which lists it on the owner's to-check page, and the description below says
// *search first* and what a duplicate costs, in the words every tool that creates spends
// (`../prose.ts`).

const get: McpTool = {
  name: "get_label",
  title: "Read one Label whole",
  description: `One **Label** with everything hanging on it: its Kind, producer, region, appellation and grapes
(or a spirit's base, age statement and strength); each **Vintage** — the years newest first, then
NV, then unknown — with its Bottles and Tastings; the Sources it was found in; and its scores.

Scores are **derived from the Tastings**, never stored: \`latest\` is the most recent Rating and
\`average\` the mean, over \`rated\` Tastings. Both matter — a wine that delighted at dinner and
disappointed three years later is information, not noise. The Label's score counts every Vintage;
each Vintage has its own.

\`unverified: true\` means an assistant created it and the owner has not looked at it yet. It is a
Label like any other: record on it freely.

Use it to confirm a \`search_catalogue\` match is the bottle in front of the owner, and to find the
Vintage id \`record_tasting\` and \`add_bottles\` take.`,
  inputSchema: {
    type: "object",
    properties: {
      label: { type: "string", description: "The Label's id, `lbl_…`, from `search_catalogue`." },
    },
    required: ["label"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    const label = await getLabel(stringArgument(input, "label") ?? "");
    if (!label) throw new Refusal("not-found", "No Label has that id.");
    return { label };
  },
};

const create: McpTool = {
  name: "create_label",
  title: "Create a Label",
  description: `Add a **Label** the catalogue does not have — one thing a producer bottles under one name,
independent of the year — with its first **Vintage**, and return both ids.

${SEARCH_FIRST}

Fill in only what was read off the label or the owner told you; leave the rest out rather than
guessing. The Label is marked **unverified** for the owner to check from their screen; it is usable
at once, so carry on and \`record_tasting\` or \`add_bottles\` on the Vintage id this returns.

${VINTAGE}`,
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: `The Label's name without the producer or the year: "Barolo Castiglione", "Lagavulin 16",
"Franciacorta Brut".`,
      },
      kind: { type: "string", description: "A Kind's id from `list_kinds`, e.g. `kind_red`." },
      producer: {
        type: "string",
        description: 'Who makes it: "Vietti". Leave it out when the label does not say.',
      },
      country: { type: "string", description: 'Where it is from, in English: "Italy".' },
      region: { type: "string", description: 'The region: "Piemonte", "Islay".' },
      appellation: {
        type: "string",
        description: 'The protected name on the label, for a wine: "Barolo DOCG" → "Barolo".',
      },
      grapes: {
        type: "array",
        items: { type: "string" },
        description:
          'The grapes of a wine, or the base of a spirit: ["Nebbiolo"], ["Malted barley"].',
      },
      age_statement: {
        type: "string",
        description: 'A spirit\'s age as the label says it: "16 years", "XO".',
      },
      strength: { type: "number", description: "Alcohol by volume, in percent: 43." },
      vintage: {
        type: ["number", "string"],
        description: `Its first Vintage: a year, "nv" or "unknown". Left out, it is "unknown" for a Kind with
vintages and "nv" for one without.`,
      },
    },
    required: ["name", "kind"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const { labelId, vintageId } = await createLabel({
      name: stringArgument(input, "name") ?? "",
      kindId: stringArgument(input, "kind") ?? "",
      producer: stringArgument(input, "producer"),
      country: stringArgument(input, "country"),
      region: stringArgument(input, "region"),
      appellation: stringArgument(input, "appellation"),
      grapes: stringsArgument(input, "grapes"),
      ageStatement: stringArgument(input, "age_statement"),
      strength: numberArgument(input, "strength"),
      vintage: datingArgument(input, "vintage"),
      // The assistant's door: always unverified (ADR-0004). Only the owner's own screen
      // creates a Label already looked at.
      unverified: true,
    });
    return { label: labelId, vintage: vintageId, unverified: true };
  },
};

export default [get, create];
