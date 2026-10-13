import { getLabel } from "@/core/queries/label";
import { Refusal } from "@/core/refusal";
import { configuredSources } from "@/core/sources/configured";
import { createLabelFromSource, linkLabelToSource } from "@/core/verbs/catalogue";
import { createLabel } from "@/core/verbs/label";
import { CANDIDATES, SEARCH_FIRST, VINTAGE } from "../prose.ts";
import {
  datingArgument,
  type McpTool,
  numberArgument,
  stringArgument,
  stringsArgument,
} from "../tool.ts";

// The Label area: one Label read whole, a Label created from a conversation, and an existing
// Label given the catalogue record the owner confirmed for it.
//
// **The assistant creates Labels directly** (ADR-0004), which is where this door parts from
// tsundoku's Inbox: the flow that matters is a photo at a restaurant table of a bottle nobody
// has catalogued, and a Tasting left waiting for the owner to get home is the friction they
// rejected every other app for. What stands in for the Inbox is two things: a Label written from
// what was read or said is born **unverified**, which lists it on the owner's to-check page, and
// the description below says *search first* and what a duplicate costs, in the words every tool
// that creates spends (`../prose.ts`). A Label made from a candidate the owner confirmed is born
// checked: its Source's facts are not what the to-check list is for (ADR-0004, amended).

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

\`unverified: true\` means an assistant wrote it from what was read or said and the owner has not
looked at it yet. It is a Label like any other: record on it freely.

Use it to confirm a \`search_catalogue\` match is the bottle in front of the owner, and to find the
Vintage id \`record_tasting\` and \`add_bottles\` take.

A Label with no \`sources\` has no photo and no catalogue page — it was imported, or written by
hand. Offer to find it with \`search_catalogue\` and, once the owner confirms a candidate, give it
that photo and page with \`link_label_source\`.`,
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

**From a candidate** \`search_catalogue\` returned and the owner confirmed: pass its \`source\` and
\`id_at_source\`, and the Kind. The record is read again from that Source — so the facts are the
Source's own, not a copy — and kept with the Label, with its bottle image and page. Anything else you
pass is the owner's and wins over the Source's: send only what they corrected or read off the bottle.

**From what was read or said**, with no Source: fill in only what was read off the label or the owner
told you; leave the rest out rather than guessing.

${CANDIDATES}

A Label from a candidate is born checked, because its facts are the Source's. One written from what
was read or said is marked **unverified** for the owner to check from their screen. Either way it is
usable at once, so carry on and \`record_tasting\` or \`add_bottles\` on the Vintage id this returns.

${VINTAGE}`,
  inputSchema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        enum: ["openfoodfacts", "vivino"],
        description: "The Source of the chosen candidate, from `search_catalogue`.",
      },
      id_at_source: {
        type: "string",
        description: "The chosen candidate's `idAtSource`: a barcode, a Vivino wine id.",
      },
      name: {
        type: "string",
        description: `The Label's name without the producer or the year: "Barolo Castiglione", "Lagavulin 16",
"Franciacorta Brut". Required without a candidate; with one, the Source's name is used when left out.`,
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
    required: ["kind"],
    additionalProperties: false,
  },
  readOnly: false,
  openWorld: true,
  async run(input) {
    const source = stringArgument(input, "source");
    const idAtSource = stringArgument(input, "id_at_source");
    if ((source === undefined) !== (idAtSource === undefined)) {
      throw new Refusal(
        "invalid",
        "Name the chosen candidate with both `source` and `id_at_source`, as `search_catalogue` returned them."
      );
    }
    if (source !== undefined && source !== "openfoodfacts" && source !== "vivino") {
      throw new Refusal("invalid", 'A Source is "openfoodfacts" or "vivino".');
    }

    const facts = {
      kindId: stringArgument(input, "kind") ?? "",
      producer: stringArgument(input, "producer"),
      country: stringArgument(input, "country"),
      region: stringArgument(input, "region"),
      appellation: stringArgument(input, "appellation"),
      grapes: stringsArgument(input, "grapes"),
      ageStatement: stringArgument(input, "age_statement"),
      strength: numberArgument(input, "strength"),
      vintage: datingArgument(input, "vintage"),
    };
    const name = stringArgument(input, "name");

    // From a candidate, born checked — `createLabelFromSource` says so whichever door calls it.
    // From what the assistant read or was told, born unverified for the owner to look over
    // (ADR-0004).
    if (source !== undefined && idAtSource !== undefined) {
      const { labelId, vintageId } = await createLabelFromSource(
        configuredSources(),
        { source, idAtSource },
        { ...facts, name }
      );
      return { label: labelId, vintage: vintageId, unverified: false };
    }
    const { labelId, vintageId } = await createLabel({
      ...facts,
      name: name ?? "",
      unverified: true,
    });
    return { label: labelId, vintage: vintageId, unverified: true };
  },
};

const linkSource: McpTool = {
  name: "link_label_source",
  title: "Link a Label to a catalogue record",
  description: `Give an **existing Label** its photo and its page in an outside catalogue — **Open Food Facts**, or
**Vivino** where this copy's owner turned it on. For the Labels with no \`sources\` in \`get_label\`: the
ones imported from Vivino or written by hand, which have no photo.

Search first: \`search_catalogue\` with the Label's producer and name (and its Kind). Then **show the
owner the candidate — name, producer, image — and link it only after they say yes**: a candidate is a
proposal to confirm, never a match, and a wrong link puts another bottle's photo on their Label.

Pass the Label's id and the confirmed candidate's \`source\` and \`id_at_source\`, as \`search_catalogue\`
returned them. The record is read again from that Source and kept with the Label — its bottle image,
its page, and the credit the page shows. **Nothing the Label says changes**: its name, producer, Kind
and the rest stay the owner's, and so does whether it is checked. Fix a wrong fact with the owner on
their screen instead.

A record already on **another** Label is refused, naming that Label: the two are the same bottle, and
the owner merges them from their screen. Linking the record a Label already has changes nothing
(\`already: true\`). A Label may have a record from each catalogue.

${CANDIDATES}`,
  inputSchema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "The Label's id, `lbl_…`, from `search_catalogue` or `get_label`.",
      },
      source: {
        type: "string",
        enum: ["openfoodfacts", "vivino"],
        description: "The Source of the candidate the owner confirmed, from `search_catalogue`.",
      },
      id_at_source: {
        type: "string",
        description: "The confirmed candidate's `idAtSource`: a barcode, a Vivino wine id.",
      },
    },
    required: ["label", "source", "id_at_source"],
    additionalProperties: false,
  },
  readOnly: false,
  openWorld: true,
  async run(input) {
    const source = stringArgument(input, "source");
    if (source !== "openfoodfacts" && source !== "vivino") {
      throw new Refusal("invalid", 'A Source is "openfoodfacts" or "vivino".');
    }
    const idAtSource = stringArgument(input, "id_at_source");
    if (idAtSource === undefined) {
      throw new Refusal(
        "invalid",
        "Name the confirmed candidate with `source` and `id_at_source`, as `search_catalogue` returned them."
      );
    }
    const linked = await linkLabelToSource(
      configuredSources(),
      stringArgument(input, "label") ?? "",
      { source, idAtSource }
    );
    return {
      label: stringArgument(input, "label"),
      source: linked.source,
      image_url: linked.imageUrl,
      page_url: linked.pageUrl,
      already: linked.already,
    };
  },
};

export default [get, create, linkSource];
