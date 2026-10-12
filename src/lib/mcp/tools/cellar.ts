import { readCellar } from "@/core/queries/cellar";
import type { McpTool } from "../tool.ts";

// The Cellar area: what can be drunk tonight (`CONTEXT.md`, **Cellar**). A view over the
// Bottles, not a table, so there is nothing to write here.

const read: McpTool = {
  name: "read_cellar",
  title: "Read the Cellar",
  description: `The **Cellar**: every Bottle in the house that is closed or open — what the owner can drink
tonight. Finished Bottles are not here; they are history, on the Label (\`get_label\`).

Grouped by section (Wine, Spirits), then by Kind and Label. Each Bottle carries its Vintage (a year,
"nv" or "unknown"), its Label, and its **Level** when open — full, 3/4, 1/2 or 1/4, by eye — because a
spirit stays open for months and what is left matters.

This is the call for *"what should I open tonight?"*: read it with \`read_palate\`, and prefer what is
already open when it suits — an open wine does not keep.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { cellar: await readCellar() };
  },
};

export default [read];
