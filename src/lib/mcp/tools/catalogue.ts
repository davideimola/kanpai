import { searchLabels } from "@/core/queries/label";
import { SEARCH_FIRST } from "../prose.ts";
import { type McpTool, numberArgument, stringArgument } from "../tool.ts";

// The catalogue area: the one question asked before anything is created (ADR-0004).
//
// Spec §3 has `search_catalogue` ask our Labels first and then the Sources — Open Food Facts,
// then Vivino (ADR-0006). The Sources are S3, so today it asks our Labels only, and says so:
// an assistant told it searched the world would read *nothing found* as *no such wine*.

const search: McpTool = {
  name: "search_catalogue",
  title: "Search the catalogue",
  description: `Find a **Label** in the owner's own catalogue by what was read off a bottle, a photo or a
menu, or by what the owner said. Call it **before \`create_label\`, every time**, and before
\`record_tasting\` or \`add_bottles\` for anything that may already be there.

It searches **only the Labels already in this catalogue** for now. Open Food Facts and Vivino come
later, so nothing found here means *not catalogued yet*, not *no such wine*.

Each word is looked for at the start of a word of the producer or the name, accents and case folded
(\`rose\` finds *Rosé*), and a Label is found when any word matches — so send several words. Results
are ranked by how many matched (\`matched\` of \`ofWords\`). A loose match on one common word is not a
match: open it with \`get_label\` before you treat it as the bottle in front of the owner.

${SEARCH_FIRST}`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: `What to look for: the producer and the name as read, e.g. "Vietti Barolo Castiglione"
or "Lagavulin 16". Words of one letter are ignored.`,
      },
      limit: {
        type: "number",
        description: "At most this many Labels. 20 when left out.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  readOnly: true,
  async run(input) {
    return {
      searched: "our Labels only — Open Food Facts and Vivino are not searched yet",
      labels: await searchLabels(
        stringArgument(input, "query") ?? "",
        numberArgument(input, "limit")
      ),
    };
  },
};

export default [search];
