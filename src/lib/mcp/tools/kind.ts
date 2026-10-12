import { listKinds } from "@/core/queries/kind";
import type { McpTool } from "../tool.ts";

// The Kind area: the vocabulary a Label is created against (ADR-0002).
//
// Not in spec §3, and needed: `create_label` takes a Kind's id, and a Kind is a row rather
// than a word in code, so the assistant reads the list rather than guessing at `kind_red`.

const kinds: McpTool = {
  name: "list_kinds",
  title: "The Kinds a Label can be",
  description: `Every **Kind** a Label can be — Red, White, Rosé, Sparkling, Whisky, Gin, … — with its id, the
section it is listed under (Wine, Spirits) and \`hasVintages\`.

\`create_label\` needs a Kind's id: take it from here, never guess one. The list is data and grows (a
beer is a new row), so read it rather than remembering it. A Kind the owner retired is not listed:
do not create against it.

\`hasVintages: false\` means a Label of that Kind has exactly one Vintage, NV — spirits, beer, sake —
and refuses a year. \`true\` means it has years, and a year nobody wrote down is "unknown".`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { kinds: await listKinds() };
  },
};

export default [kinds];
