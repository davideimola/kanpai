import { setVintageYear } from "@/core/verbs/vintage";
import { type McpTool, numberArgument, stringArgument, stringsArgument } from "../tool.ts";

// The Vintage area: learning a year that was unknown (ADR-0010). Nothing is re-entered — the
// Bottles and Tastings move.

const setYear: McpTool = {
  name: "set_vintage_year",
  title: "Set the year of an unknown Vintage",
  description: `The owner has learned the year of a wine recorded as **unknown** — they found the bottle, read
the cork, checked a receipt. Move its Bottles and Tastings from the Label's unknown Vintage to that
year's Vintage, which is created if the Label has none for it yet.

Name the Bottles and Tastings to move, or **name neither and everything on the unknown Vintage
moves** (its Wishes too). Name only some when only some were that year — two bottles of 2018 and one
nobody checked. The unknown Vintage goes once nothing is left on it.

Only for a year actually learned. **Use "unknown", never "nv", when the year isn't known**; "nv" is
only for a producer who blends years, and a guessed year is worse than unknown — leave it unknown.`,
  inputSchema: {
    type: "object",
    properties: {
      label: { type: "string", description: "The Label's id, `lbl_…`." },
      year: { type: "number", description: "The year learned: 2018." },
      bottles: {
        type: "array",
        items: { type: "string" },
        description:
          "The ids of the Bottles that are that year. Leave out with `tastings` to move all.",
      },
      tastings: {
        type: "array",
        items: { type: "string" },
        description: "The ids of the Tastings that were that year.",
      },
    },
    required: ["label", "year"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return setVintageYear({
      labelId: stringArgument(input, "label") ?? "",
      year: numberArgument(input, "year") ?? Number.NaN,
      bottleIds: stringsArgument(input, "bottles"),
      tastingIds: stringsArgument(input, "tastings"),
    });
  },
};

export default [setYear];
