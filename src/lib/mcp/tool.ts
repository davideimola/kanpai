import { Refusal } from "@/core/refusal";
import type { VintageOf } from "@/core/verbs/vintage";

// What one MCP tool is, in this app — tsundoku's shape, taken over with its stack (ADR-0001).
//
// A tool is a **name, prose an assistant reads, a JSON Schema for its arguments, and a
// call into `src/core`** — and nothing else. It holds no SQL, no `if` about the model and
// no interpretation of what came back: if a tool is doing something a page would also have
// to do, the thing belongs in a query or a verb, not here.
//
// The framing around it — JSON-RPC, the bearer, the status codes — is `protocol.ts` and
// the route handler. Nothing in this file or in `tools/` knows those exist.

/**
 * A JSON Schema for a tool's arguments, as MCP requires it: an object schema, always,
 * even when the tool takes nothing.
 *
 * Typed loosely on purpose. This is a wire format an assistant reads, not a shape this
 * app has an opinion about, and a stricter type here would only mean writing the schema
 * twice.
 */
export type ToolInputSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

/** One tool: what it is called, what it says it does, and what it does. */
export type McpTool = {
  /**
   * What the assistant does, as spec §3 names it — `record_tasting`, `read_cellar` —
   * lower_snake_case, verb first. Not tsundoku's `area_question`: the assistant reads these
   * as things to do for the owner, and the spec, the README and the sommelier prompt name
   * them this way already.
   */
  readonly name: string;
  /** A short human label, for a client that shows one. */
  readonly title: string;
  /**
   * What the tool does, in the owner's vocabulary (`CONTEXT.md`) and in enough words that
   * an assistant picks it for the right question. **This is product**: the owner is a
   * beginner and the assistant is their sommelier, so what a Vintage, a Level or a Rating
   * is gets said here, where the assistant reads it, and not only in a doc it never sees.
   */
  readonly description: string;
  readonly inputSchema: ToolInputSchema;
  /**
   * Whether calling it changes anything. Read tools say `true` and mean it — a client is
   * allowed to call them without asking the owner first, which is the difference between
   * a fluid conversation and one interrupted per query.
   */
  readonly readOnly: boolean;
  /**
   * Whether writing it takes something away that cannot be put back. Only meaningful on a
   * tool that writes, and **omitted means it does not** — the safe default here and,
   * deliberately, the opposite of the protocol's, which is why the door states all three
   * hints on every tool (`protocol.ts`).
   *
   * The question is **what is gone afterwards**, not whether it is a write. `update_palate`
   * says `true`: it replaces prose the owner wrote, whole, with no history. `update_bottle`
   * finishing a Bottle says nothing, and is right to: the Bottle is kept, as history.
   */
  readonly destructive?: boolean;
  /**
   * Whether calling it may reach outside this app's own database — a Source, over the
   * network (ADR-0011). **Omitted means it does not**, the truth for every tool but the two
   * that ask Open Food Facts or Vivino: `search_catalogue` and `create_label`.
   */
  readonly openWorld?: boolean;
  /**
   * Answer the call. Returns plain data; the framing turns it into MCP content.
   *
   * `input` has been through no validation beyond the transport's own JSON parse and the
   * closed schema (`protocol.ts` refuses an argument the tool does not declare): read what
   * you need out of it and pass it to a query. A refusal from the core arrives at the caller
   * as a `Refusal` and is translated there — never caught here.
   */
  run(input: Record<string, unknown>): Promise<unknown>;
};

/** The optional string at `key`, or `undefined` — the whole of argument reading. */
export function stringArgument(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The optional list of strings at `key`, or `undefined` where nothing was sent: the grapes
 * of a Label, the Bottles to move to a year.
 *
 * **A lone string counts as a list of one**, because an assistant filling in a schema sends
 * the scalar often enough to matter. Blanks, nulls and nested values are dropped: they are a
 * client sending the wrong shape, and there is no text in them to hand on.
 */
export function stringsArgument(input: Record<string, unknown>, key: string): string[] | undefined {
  const value = input[key];
  if (typeof value === "string")
    return stringArgument(input, key) === undefined ? undefined : [value.trim()];
  if (!Array.isArray(value)) return undefined;

  return value
    .filter((said) => said !== null && said !== undefined && typeof said !== "object")
    .map((said) => String(said).trim())
    .filter((said) => said !== "");
}

/**
 * The optional number at `key`, or `undefined`.
 *
 * A string is accepted, because an assistant filling in a schema that says `number` sends
 * `"4"` often enough to matter and the alternative is a refusal the owner would never
 * understand. What is **not** accepted is anything that is not a number — `NaN` would reach
 * a verb as a value it refuses in prose about half steps, which would be a lie about what
 * went wrong.
 */
export function numberArgument(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const read = Number(value);
  return Number.isFinite(read) ? read : undefined;
}

/**
 * Which Vintage of a Label is meant, at `key`: a year, `"nv"` or `"unknown"` (ADR-0010), or
 * `undefined` where nothing was sent.
 *
 * A year sent as `"2019"` is a year, and `"NV"` is `nv`. Anything else — `"N.V."`, `"?"`,
 * `"2019-ish"` — is refused, saying what a Vintage is, rather than guessed at: a wrong guess
 * here is a Bottle or a Tasting on the wrong Vintage.
 */
export function datingArgument(
  input: Record<string, unknown>,
  key: string
): number | "nv" | "unknown" | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const said = value.trim().toLowerCase();
    if (said === "") return undefined;
    if (said === "nv" || said === "unknown") return said;
  }
  const year = numberArgument(input, key);
  if (year !== undefined && Number.isInteger(year)) return year;
  throw new Refusal(
    "invalid",
    'A Vintage is a year like 2019, "nv" when the producer blends years, or "unknown" when the year was not written down.'
  );
}

/**
 * The three arguments `vintageArgument` reads, declared once for every tool that takes them,
 * so `record_tasting` and `add_bottles` cannot describe the same thing two ways.
 */
export const VINTAGE_ARGUMENTS = {
  vintage_id: {
    type: "string",
    description: "The Vintage's id, `vtg_…`, from `create_label` or `get_label`.",
  },
  label: {
    type: "string",
    description:
      "Instead of `vintage_id`: the Label's id, `lbl_…`, with `vintage` saying which one.",
  },
  vintage: {
    type: ["number", "string"],
    description: `With \`label\`: a year, "nv" or "unknown". That Vintage is found, or created when the
Label has none for it yet.`,
  },
} as const;

/**
 * The Vintage a Bottle or a Tasting goes on, as the tools that take one say it: by its id at
 * `vintage_id`, or by its Label at `label` and which Vintage at `vintage` — found, or created
 * when that year has none yet. `undefined` when neither was sent.
 *
 * Half of the second form is refused rather than completed: a `label` with no `vintage` could
 * be read as *unknown*, and that guess is exactly the one ADR-0010 tells the assistant not to
 * make silently.
 */
export function vintageArgument(input: Record<string, unknown>): string | VintageOf | undefined {
  const id = stringArgument(input, "vintage_id");
  const labelId = stringArgument(input, "label");
  const dating = datingArgument(input, "vintage");

  if (id !== undefined && (labelId !== undefined || dating !== undefined)) {
    throw new Refusal(
      "invalid",
      "Name the Vintage one way: `vintage_id`, or `label` with `vintage` — not both."
    );
  }
  if (id !== undefined) return id;
  if (labelId === undefined && dating === undefined) return undefined;
  if (labelId === undefined || dating === undefined) {
    throw new Refusal(
      "invalid",
      'Name the Vintage with both `label` and `vintage`: a year, "nv", or "unknown" when the year was not written down.'
    );
  }
  return { labelId, dating };
}
