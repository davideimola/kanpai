import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyTheCatalogue } from "@/test/catalogue";
import { CANDIDATES, SEARCH_FIRST, VINTAGE } from "./prose.ts";
import { answer } from "./protocol.ts";
import type { McpTool } from "./tool.ts";

// The walls over the tool list, and the S2 flow driven through it.
//
// The walk is a `readdir`, which is exactly what `./tools.ts` refuses to be and for a reason
// that does not reach here: the source tree is not shipped, so the **door** must ask the
// bundler. A test runs against the source tree by definition, and what matters is that both
// select the same files — so this uses the door's own pattern. A tool file added later is
// checked without this file being edited. (tsundoku's `tools/pass.test.ts` is the original.)
//
// The flow at the bottom is the one thing here that reaches the database: the tools are
// adapters, and what they answer is Seam 1's business — but *create a Label, record a Tasting,
// read the Cellar* is the slice's own definition of done, and asking it through `answer` is
// what proves the adapters hand the verbs what they expect.

const TOOLS = fileURLToPath(new URL("./tools/", import.meta.url));

/** `./tools.ts`'s own pattern, so a file this reads is a file the door mounts. */
const AN_AREA = /^[a-z0-9-]+\.ts$/;

const AREAS = readdirSync(TOOLS)
  .filter((file) => AN_AREA.test(file))
  .sort();

const everyTool: McpTool[] = (
  await Promise.all(
    AREAS.map(async (file) => {
      const area = (await import(/* @vite-ignore */ `./tools/${file}`)) as { default: McpTool[] };
      return area.default;
    })
  )
).flat();

const mounted = async () => everyTool;

function byName(name: string): McpTool {
  const tool = everyTool.find((one) => one.name === name);
  if (!tool) throw new Error(`no tool called ${name}`);
  return tool;
}

describe("the tool list", () => {
  // Spec §3, plus the two reads the assistant cannot work without:
  // `list_kinds` (a Label is created against a Kind's id) and `read_wishes` (a Wish is closed
  // by its id). A tool arriving or leaving shows up here, which is the point: a client that
  // photographed the list does not notice either (`./README.md`).
  it("is spec §3's", () => {
    expect(everyTool.map((tool) => tool.name).sort()).toEqual([
      "add_bottles",
      "add_wish",
      "close_wish",
      "create_label",
      "get_label",
      "list_kinds",
      "read_cellar",
      "read_palate",
      "read_tastings",
      "read_wishes",
      "record_tasting",
      "search_catalogue",
      "set_vintage_year",
      "update_bottle",
      "update_palate",
    ]);
  });

  // `protocol.ts` refuses an argument a tool does not declare only where the schema is
  // closed. A tool that left it out would quietly opt itself back into the silent drop.
  it("closes every schema, and declares every argument it requires", () => {
    for (const tool of everyTool) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
      const declared = Object.keys(tool.inputSchema.properties ?? {});
      for (const required of tool.inputSchema.required ?? []) {
        expect(declared, tool.name).toContain(required);
      }
    }
  });

  it("states all three hints on every tool", async () => {
    const listed = (await answer(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      mounted
    )) as { result: { tools: { name: string; annotations: Record<string, unknown> }[] } };

    for (const tool of listed.result.tools) {
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        // Only the two tools that ask a Source reach past this app's own database (ADR-0011).
        openWorldHint: ["search_catalogue", "create_label"].includes(tool.name),
      });
    }
  });

  // ADR-0011: a candidate is a proposal, said the same way wherever one is handled.
  it("says what a candidate is wherever one is returned or chosen", () => {
    for (const name of ["search_catalogue", "create_label"]) {
      expect(byName(name).description, name).toContain(CANDIDATES);
    }
  });

  // ADR-0004: the assistant creates directly, so *search first* and what a duplicate costs
  // are said by every tool that may lead to a Label, in the same words.
  it("says search first, and what a duplicate costs, wherever a Label may be created", () => {
    for (const name of ["create_label", "search_catalogue", "record_tasting", "add_bottles"]) {
      expect(byName(name).description, name).toContain(SEARCH_FIRST);
    }
  });

  // ADR-0010: unknown, never NV, when the year is not known — said wherever a Vintage is named.
  it("says what a Vintage is wherever one is named by its dating", () => {
    for (const tool of everyTool) {
      if (!("vintage" in (tool.inputSchema.properties ?? {}))) continue;
      expect(tool.description, tool.name).toContain(VINTAGE);
    }
  });

  // The words `CONTEXT.md` says to avoid, where an assistant would learn them from.
  it("speaks the vocabulary", () => {
    for (const tool of everyTool) {
      const prose = [tool.title, tool.description, JSON.stringify(tool.inputSchema)].join("\n");
      expect(prose, tool.name).not.toMatch(
        /\b(inventory|check-in|stock|profile|preferences|stars|draft|pending|N\.V\.|U\.V\.)\b/i
      );
    }
  });
});

/** One `tools/call`, and what came back: the answer as data, or the refusal. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const said = (await answer(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    mounted
  )) as {
    result?: {
      isError?: boolean;
      content: { text: string }[];
      _meta?: Record<string, { code: string }>;
    };
    error?: { code: number; message: string };
  };
  if (said.error) throw new Error(`${name}: ${said.error.message}`);
  const text = said.result?.content[0]?.text ?? "";
  return said.result?.isError
    ? { refused: text, code: said.result._meta?.["kanpai/refusal"]?.code }
    : JSON.parse(text);
}

describe("the S2 flow, through the door's own framing", () => {
  beforeEach(emptyTheCatalogue);

  it("creates a Label by hand, records a Tasting, adds Bottles and reads the Cellar", async () => {
    expect((await call("search_catalogue", { query: "Vietti Barolo" })).labels).toEqual([]);

    const created = await call("create_label", {
      name: "Barolo Castiglione",
      producer: "Vietti",
      kind: "kind_red",
      region: "Piemonte",
      grapes: "Nebbiolo",
    });
    expect(created).toMatchObject({ label: expect.stringMatching(/^lbl_/), unverified: true });

    const tasted = await call("record_tasting", {
      label: created.label,
      vintage: "2019",
      rating: 4,
      food: "steak",
      body_and_feel: "Full, and dry in the mouth",
    });
    expect(tasted.tasting).toMatch(/^tst_/);

    const added = await call("add_bottles", { vintage_id: created.vintage, count: 2 });
    expect(added.bottles).toHaveLength(2);
    await call("update_bottle", { bottle: added.bottles[0], action: "open", level: "1/2" });

    const { cellar } = await call("read_cellar");
    expect(cellar).toMatchObject([
      {
        section: "Wine",
        // Two Bottles added in one call share their created_at, so their order is the ids'.
        bottles: expect.arrayContaining([
          expect.objectContaining({
            id: added.bottles[0],
            state: "open",
            level: "1/2",
            vintage: expect.objectContaining({ dating: "unknown" }),
          }),
          expect.objectContaining({ id: added.bottles[1], state: "closed", level: null }),
        ]),
      },
    ]);

    const { label } = await call("get_label", { label: created.label });
    expect(label).toMatchObject({
      unverified: true,
      grapes: ["Nebbiolo"],
      score: { latest: 4, rated: 1 },
      vintages: [{ year: 2019 }, { dating: "unknown" }],
    });

    expect((await call("search_catalogue", { query: "castiglione" })).labels).toHaveLength(1);
  });

  it("records a loose Tasting, with no Label", async () => {
    await call("record_tasting", { description: "Primitivo by the glass", rating: 3.5 });
    expect((await call("read_tastings", { grape: "primitivo" })).tastings).toMatchObject([
      { description: "Primitivo by the glass", rating: 3.5, label: null },
    ]);
  });

  it("hands a refusal back as a result the assistant can read, with its code", async () => {
    expect(await call("record_tasting", { description: "A glass", rating: 4.3 })).toEqual({
      refused: "A Rating is one to five, in half steps.",
      code: "invalid",
    });
    expect(await call("get_label", { label: "lbl_nothing" })).toMatchObject({ code: "not-found" });
    expect(await call("record_tasting", { vintage: "N.V." })).toMatchObject({ code: "invalid" });
    expect(await call("record_tasting", { label: "lbl_x" })).toMatchObject({ code: "invalid" });
    expect(await call("update_palate", {})).toMatchObject({ code: "invalid" });
  });
});
