import { readPalate } from "@/core/queries/palate";
import { Refusal } from "@/core/refusal";
import { writePalate } from "@/core/verbs/palate";
import type { McpTool } from "../tool.ts";

// The Palate area: the owner's taste in prose, written to the sommelier (`CONTEXT.md`,
// **Palate**). Readable and writable here on purpose — it is an instruction to the assistant,
// and the assistant is the one who notices it going stale.

const read: McpTool = {
  name: "read_palate",
  title: "Read the owner's Palate",
  description: `The **Palate**: the owner's taste, in their prose — what they like, what they don't, what they
are curious about, what they want to spend. It is written **to you**, as an instruction: read it before
you recommend anything, and follow it over your own taste. It is Markdown: headings, lists, bold.

Empty until somebody writes it. If it is, recommend from \`read_tastings\` and offer to start one.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { palate: await readPalate() };
  },
};

const update: McpTool = {
  name: "update_palate",
  title: "Rewrite the owner's Palate",
  description: `Replace the **Palate** with new prose — the whole of it. What is not in the text you send is gone.

Keep it current as Tastings accumulate: when a pattern shows (*three Nebbiolos rated 4.5, every
oaky Chardonnay a 2*), **propose the change to the owner in the conversation first**, and write it only
once they agree. Start from \`read_palate\` and keep what they wrote; it is theirs, in their words.

Prose a sommelier would read, not a list of scores: what they like and why, what they don't,
what they are curious about, their budget. Write it in Markdown — \`##\` headings for the parts, \`-\`
lists, **bold** — which the owner's page draws as formatting; raw HTML is shown as text.`,
  inputSchema: {
    type: "object",
    properties: {
      prose: {
        type: "string",
        description: "The whole new Palate. An empty string empties it.",
      },
    },
    required: ["prose"],
    additionalProperties: false,
  },
  readOnly: false,
  destructive: true,
  async run(input) {
    // Not `stringArgument`: an empty string is a real answer here — it empties the Palate —
    // and a missing one must not be read as it, or a malformed call would erase what the owner
    // wrote.
    const prose = input.prose;
    if (typeof prose !== "string") {
      throw new Refusal("invalid", "Send the whole Palate as `prose`; an empty string empties it.");
    }
    await writePalate(prose);
    return { palate: await readPalate() };
  },
};

export default [read, update];
