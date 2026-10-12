import { Refusal } from "@/core/refusal";
import {
  addBottles,
  finishBottle,
  type Level,
  openBottle,
  setBottleLevel,
} from "@/core/verbs/bottle";
import { SEARCH_FIRST, VINTAGE } from "../prose.ts";
import {
  type McpTool,
  numberArgument,
  stringArgument,
  VINTAGE_ARGUMENTS,
  vintageArgument,
} from "../tool.ts";

// The Bottle area: what comes into the house, and what happens to it (ADR-0007).
//
// One tool for the three things a Bottle does after it arrives — open, set the Level, finish —
// as spec §3 has it, because to the owner they are one gesture each on the same object and an
// assistant choosing between three tools would only choose wrong.

const LEVELS: readonly Level[] = ["full", "3/4", "1/2", "1/4"];

const add: McpTool = {
  name: "add_bottles",
  title: "Add Bottles to the Cellar",
  description: `Put one or more **Bottles** of one Vintage into the **Cellar**, closed, bought together — *"I
picked up three of the Barolo 2019"*. Returns their ids.

Name the Vintage by \`vintage_id\`, or by \`label\` with \`vintage\`. Find the Label first: ${SEARCH_FIRST}

${VINTAGE}

Leave the price and the shop out when the owner did not say them: nothing here is a receipt.`,
  inputSchema: {
    type: "object",
    properties: {
      ...VINTAGE_ARGUMENTS,
      count: { type: "number", description: "How many Bottles. 1 when left out." },
      bought_on: { type: "string", description: "The day they were bought, `2026-10-12`." },
      price: { type: "string", description: 'What one cost, with no currency: "24.50".' },
      bought_where: { type: "string", description: "The shop, the winery, the friend." },
    },
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const vintage = vintageArgument(input);
    if (vintage === undefined) {
      throw new Refusal("invalid", "Name the Vintage: `vintage_id`, or `label` with `vintage`.");
    }
    const bottles = await addBottles(vintage, numberArgument(input, "count") ?? 1, {
      boughtOn: stringArgument(input, "bought_on"),
      price: stringArgument(input, "price"),
      boughtWhere: stringArgument(input, "bought_where"),
    });
    return { bottles };
  },
};

const update: McpTool = {
  name: "update_bottle",
  title: "Open, level or finish a Bottle",
  description: `Say what happened to one **Bottle** in the Cellar. A Bottle is **closed**, **open** or
**finished**:

- \`open\`: a closed Bottle is opened. It starts \`full\` unless you say otherwise — one brought home
  half drunk is \`1/2\`.
- \`set_level\`: how much is left of an open Bottle, by eye — \`full\`, \`3/4\`, \`1/2\` or \`1/4\`. A spirit
  stays open for months, and this is how the Cellar knows what is actually left.
- \`finish\`: it is empty. It is **kept, as history**, and leaves the Cellar. A closed Bottle may be
  finished directly — a wine opened and drunk the same evening is one call.

Finishing records no Tasting: offer to \`record_tasting\` for it. The Bottle's id is in \`read_cellar\`
or \`get_label\`.`,
  inputSchema: {
    type: "object",
    properties: {
      bottle: { type: "string", description: "The Bottle's id, `btl_…`." },
      action: { type: "string", enum: ["open", "set_level", "finish"] },
      level: {
        type: "string",
        enum: [...LEVELS],
        description: "For `open` (default `full`) and `set_level`: full, 3/4, 1/2 or 1/4.",
      },
    },
    required: ["bottle", "action"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    const bottle = stringArgument(input, "bottle") ?? "";
    const action = stringArgument(input, "action");
    const level = stringArgument(input, "level") as Level | undefined;

    switch (action) {
      case "open":
        await openBottle(bottle, { level });
        break;
      case "set_level":
        if (!level) throw new Refusal("invalid", "Say the Level: full, 3/4, 1/2 or 1/4.");
        await setBottleLevel(bottle, level);
        break;
      case "finish":
        await finishBottle(bottle);
        break;
      default:
        throw new Refusal("invalid", "The action is open, set_level or finish.");
    }
    return { bottle, done: action };
  },
};

export default [add, update];
