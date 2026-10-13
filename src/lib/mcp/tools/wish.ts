import { listOpenWishes } from "@/core/queries/wish";
import { addWish, closeWish, type WishEnding } from "@/core/verbs/wish";
import { type McpTool, stringArgument } from "../tool.ts";

// The Wish area: what the owner wants to try or buy, and how each one ended.
//
// A Wish names a Label already in the catalogue, or one Vintage of it, and creates nothing:
// a wine the catalogue does not know is `create_label` first, under the same *search first*.

const add: McpTool = {
  name: "add_wish",
  title: "Add a Wish",
  description: `The owner wants to try or buy something: a **Label**, or one **Vintage** of it — exactly one of
the two. Say why and where the idea came from: *you suggested it*, *a friend*, *seen at the wine
shop*.

The Label must already be in the catalogue: find it with \`search_catalogue\`, or create it with
\`create_label\` first. Wish for the Label unless a particular year is the point. A Label is wished
for once: refused (\`already-exists\`) while it has an open Wish — \`read_wishes\` shows it.`,
  inputSchema: {
    type: "object",
    properties: {
      label: { type: "string", description: "The Label's id, `lbl_…`." },
      vintage_id: {
        type: "string",
        description: "Instead of `label`: one Vintage's id, `vtg_…`, when the year is the point.",
      },
      why: { type: "string", description: "Why they want it, in a sentence." },
      came_from: {
        type: "string",
        description: 'Where the idea came from: "the assistant suggested it", "a friend".',
      },
    },
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const wish = await addWish({
      labelId: stringArgument(input, "label"),
      vintageId: stringArgument(input, "vintage_id"),
      why: stringArgument(input, "why"),
      cameFrom: stringArgument(input, "came_from"),
    });
    return { wish };
  },
};

const read: McpTool = {
  name: "read_wishes",
  title: "Read the wishlist",
  description: `The open **Wishes**, newest first: what the owner wants to try or buy, with the Label (and the
Vintage, when one was named), why, and where the idea came from. Read it before suggesting a
purchase, so you do not suggest what is already wished for.`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { wishes: await listOpenWishes() };
  },
};

const close: McpTool = {
  name: "close_wish",
  title: "Close a Wish",
  description: `A Wish ended: it was **bought**, **tasted**, or **dropped**. Closing records only how it ended —
when it was bought, also \`add_bottles\`; when it was tasted, also \`record_tasting\`. Refused on a Wish
already closed. The Wish's id is in \`read_wishes\`.`,
  inputSchema: {
    type: "object",
    properties: {
      wish: { type: "string", description: "The Wish's id, `wish_…`." },
      as: { type: "string", enum: ["bought", "tasted", "dropped"] },
    },
    required: ["wish", "as"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const wish = stringArgument(input, "wish") ?? "";
    await closeWish(wish, (stringArgument(input, "as") ?? "") as WishEnding);
    return { wish, closed: stringArgument(input, "as") };
  },
};

export default [add, read, close];
