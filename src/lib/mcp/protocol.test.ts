import { describe, expect, it } from "vitest";

import { answer } from "./protocol.ts";
import type { McpTool } from "./tool.ts";

// Seam 2's arithmetic, and it is the framing rather than the model: a wire contract in, a
// verdict out, no database and no bundler. `answer` takes the tool list as an argument, which
// is what lets this file hand it two tools of its own instead of the door's.
//
// **What it is about is the argument nobody read.** Every schema on this door says
// `additionalProperties: false`, and this is the wall that makes it true. tsundoku shipped
// without it, and a renamed argument sent by an assistant holding the older tool list was
// dropped in silence: the score was recorded, attached to nothing. Here the same failure would
// record a Tasting loose because the argument naming its Vintage was spelled the old way — a
// real thing in this model (ADR-0005), so the row would look ordinary.

/** One write tool, shaped like the door's own and answering with what it was given. */
const tool: McpTool = {
  name: "record_tasting",
  title: "Record a Tasting",
  description: "An occasion, its Rating, and the Vintage it was on.",
  inputSchema: {
    type: "object",
    properties: {
      place: { type: "string" },
      rating: { type: "number" },
      vintage: { type: "string" },
    },
    required: ["place", "rating"],
    additionalProperties: false,
  },
  readOnly: false,
  async run(input) {
    return { saw: Object.keys(input).sort() };
  },
};

/** The one shape a tool that takes nothing has, which the rule has to answer for too. */
const takesNothing: McpTool = {
  name: "read_cellar",
  title: "Read the Cellar",
  description: "The Cellar.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { cellar: [] };
  },
};

const mounted = async () => [tool, takesNothing];

/** One `tools/call`, as a client sends it. */
function call(name: string, args: Record<string, unknown>) {
  return answer(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    mounted
  );
}

describe("an argument the tool does not take", () => {
  it("refuses the call rather than dropping it", async () => {
    const said = await call("record_tasting", { place: "home", rating: 4, vintage_id: "v1" });

    expect(said?.error?.code).toBe(-32602);
    // Named, because the reader is a program that can retry: a refusal saying *bad arguments*
    // would leave an assistant guessing which of the three it sent was wrong.
    expect(said?.error?.message).toContain("`vintage_id`");
  });

  // The half that makes it actionable in the same turn rather than in another conversation.
  it("says what the tool does take", async () => {
    const said = await call("record_tasting", { place: "home", rating: 4, vintage_id: "v1" });

    for (const argument of ["`place`", "`rating`", "`vintage`"]) {
      expect(said?.error?.message).toContain(argument);
    }
  });

  // The cause is almost always a stale photograph of the tool list, and saying so is what
  // turns a refusal into the one thing the client can actually do about it.
  it("says the list may be out of date", async () => {
    const said = await call("record_tasting", { place: "home", rating: 4, vintage_id: "v1" });

    expect(said?.error?.message).toMatch(/older list/i);
  });

  it("names every unknown argument and not only the first", async () => {
    const said = await call("record_tasting", {
      place: "home",
      rating: 4,
      vintage_id: "v1",
      label: "l1",
    });

    expect(said?.error?.message).toContain("`vintage_id`");
    expect(said?.error?.message).toContain("`label`");
  });

  it("writes nothing, which is the whole point", async () => {
    const said = await call("record_tasting", { place: "home", rating: 4, vintage_id: "v1" });

    expect(said?.result).toBeUndefined();
  });

  it("refuses an argument sent to a tool that takes none", async () => {
    const said = await call("read_cellar", { kind: "kind_red" });

    expect(said?.error?.code).toBe(-32602);
    expect(said?.error?.message).toContain("no arguments at all");
  });
});

describe("an argument the tool does take", () => {
  it("reaches it", async () => {
    const said = await call("record_tasting", { place: "home", rating: 4, vintage: "v1" });

    expect(said?.result).toEqual({
      content: [
        { type: "text", text: JSON.stringify({ saw: ["place", "rating", "vintage"] }, null, 2) },
      ],
    });
  });

  // Absent is not unknown. Everything on this tool but `place` and `rating` is optional, and a
  // rule that could not tell the two apart would refuse every ordinary call.
  it("lets an optional one be left out", async () => {
    const said = await call("record_tasting", { place: "home", rating: 4 });

    expect(said?.error).toBeUndefined();
  });

  it("lets a tool that takes nothing be called with nothing", async () => {
    const said = await call("read_cellar", {});

    expect(said?.error).toBeUndefined();
  });
});

describe("a tool that is not here", () => {
  // Unchanged by the rule above, and checked because the unknown-argument branch runs after
  // the tool is found: a call naming no tool must still say so rather than complaining about
  // arguments to something that does not exist.
  it("is still the thing that is said", async () => {
    const said = await call("log_tasting", { place: "home" });

    expect(said?.error?.message).toContain("no tool called");
  });
});
