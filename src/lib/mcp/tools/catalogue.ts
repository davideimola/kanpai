import { searchCatalogue } from "@/core/queries/catalogue";
import { configuredSources } from "@/core/sources/configured";
import { CANDIDATES, SEARCH_FIRST } from "../prose.ts";
import { type McpTool, numberArgument, stringArgument } from "../tool.ts";

// The catalogue area: the one question asked before anything is created (ADR-0004).
//
// Our Labels first, then the Sources this copy has — Open Food Facts, and Vivino where the
// copy's owner turned it on — in the order the Kind names (ADR-0011). The answer always says
// which Sources were asked and which were off or did not answer: an assistant told nothing
// about a Source would read *nothing found* as *no such bottle*.

const search: McpTool = {
  name: "search_catalogue",
  title: "Search the catalogue",
  description: `Find a **Label** by what was read off a bottle, a photo or a menu, by what the owner said, or by
the barcode. Call it **before \`create_label\`, every time**, and before \`record_tasting\` or
\`add_bottles\` for anything that may already be there.

It answers in two parts:

- \`labels\`: the owner's own Labels. Each word is looked for at the start of a word of the producer
  or the name, accents and case folded, and a Label is found when any word matches — ranked by how
  many matched (\`matched\` of \`ofWords\`). A loose match on one common word is not a match: open it
  with \`get_label\` before you treat it as the bottle in front of the owner.
- \`candidates\`: records from outside catalogues — **Open Food Facts**, and **Vivino** when this copy's
  owner turned it on — with producer, name, region, strength, the years known, a bottle image and the
  page. \`sources\` says which were consulted, which are off on this copy and which did not answer; a
  Source that did not answer says nothing about the bottle. To make a Label from a candidate, pass its
  \`source\` and \`id_at_source\` to \`create_label\`.

Send the Kind when you know it: wine, grappa and sake are asked of Vivino first, the other spirits of
Open Food Facts first. Send the producer apart from the name when you can: candidates sharing no word
with it are discarded (\`discarded\` counts them).

${CANDIDATES}

${SEARCH_FIRST}`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: `What to look for: the name as read, e.g. "Barolo Castiglione" or "Lagavulin 16" — with the
producer in it too when you do not send \`producer\`. Words of one letter are ignored.`,
      },
      producer: {
        type: "string",
        description:
          'Who makes it, as read: "Vietti", "Masi". Used to discard candidates from someone else.',
      },
      kind: {
        type: "string",
        description: "A Kind's id from `list_kinds`, e.g. `kind_gin`: which Source is asked first.",
      },
      barcode: {
        type: "string",
        description:
          "The digits under the bars (EAN). Asked of Open Food Facts, and of the Labels found by it before.",
      },
      limit: {
        type: "number",
        description: "At most this many of the owner's Labels. 20 when left out.",
      },
    },
    additionalProperties: false,
  },
  readOnly: true,
  openWorld: true,
  async run(input) {
    const answer = await searchCatalogue(configuredSources(), {
      query: stringArgument(input, "query"),
      producer: stringArgument(input, "producer"),
      kind: stringArgument(input, "kind"),
      barcode: stringArgument(input, "barcode"),
      limit: numberArgument(input, "limit"),
    });
    return {
      ...answer,
      confirm:
        answer.candidates.length > 0
          ? "Candidates are proposals from outside catalogues, not matches: confirm one with the owner before creating a Label from it."
          : undefined,
    };
  },
};

export default [search];
