import { isRefusal } from "@/core/refusal";
import type { McpTool } from "./tool.ts";

// MCP over one HTTP endpoint: the framing, and only the framing.
//
// tsundoku's, taken over with its stack (ADR-0001). This is the thin part of a thin adapter:
// it parses JSON-RPC, answers the four methods a tools-only server owes a client, hands a
// call to a tool and turns what comes back — an answer or a `Refusal` — into something an
// assistant can read. It knows nothing about Labels, Bottles or SQL, and the moment it does,
// the thing it learned belongs in `src/core`.
//
// **Streamable HTTP, statelessly.** One POST carries one JSON-RPC message and gets one
// JSON response; there is no session id, no SSE stream and nothing to resume. The
// transport permits exactly this — a server MAY answer a POST with `application/json`
// instead of a stream — and for a read door over a database it is the whole of what is
// needed. Nothing here holds state between requests, which is also why the container can
// be restarted under a connected assistant without it noticing.
//
// The revisions it speaks and the reasoning behind each choice below are tsundoku's,
// researched there (`docs/research/mcp-remote-auth.md` in that repository) and not repeated.

/**
 * The revisions this server will speak, newest first.
 *
 * A client names one in `initialize` and gets that one back if it is here, or the newest
 * one we know if it is not — which is what the handshake is for. The list is short and
 * concrete rather than "whatever the client said": the three below differ in ways that do
 * not touch a tools-only server, and a revision nobody has read is not a promise to make.
 * The newest MCP revision is deliberately absent — it removes `initialize` altogether,
 * and no client documents it yet.
 */
const SPOKEN_REVISIONS = ["2025-11-25", "2025-06-18", "2025-03-26"] as const;

const NEWEST = SPOKEN_REVISIONS[0];

/** What an assistant is told this server is, and what it is for. */
const SERVER_INFO = {
  name: "kanpai",
  title: "kanpai",
  version: "0.1.0",
} as const;

/**
 * Read to the assistant before it asks anything, and the one place this door is allowed
 * to be opinionated — because the vocabulary *is* the product (`CONTEXT.md`), and an
 * assistant that thinks a rating belongs to a wine rather than to an evening will ask the
 * wrong question of every tool here.
 */
const INSTRUCTIONS = `kanpai is one person's record of wine and spirits, and you are their sommelier. How much they
know is in their Palate, in their words; when it does not say, take them for a beginner: explain
simply, and teach as you go — "dry in the mouth" is what tannins feel like.

The words, which are the ones their screens show. A **Label** is one thing a producer bottles under
one name, independent of the year: a wine or a spirit, of a **Kind** (Red, Sparkling, Whisky…). A
**Vintage** is one year of a Label, or **NV** when the producer blends years (almost every spirit, a
non-vintage sparkling), or **unknown** when the wine has a year nobody wrote down — never use NV to
mean "I don't know". A **Bottle** is one physical bottle in the house: closed, open (with a **Level**
— full, 3/4, 1/2, 1/4) or finished, and finished ones are kept as history. The **Cellar** is the
Bottles not finished: what can be drunk tonight. A **Tasting** is one occasion they drank something,
with a **Rating** of 1 to 5 in half steps and what they thought; it may be loose, with no Label, for
a glass at a restaurant. A Label's score is derived from its Tastings, never stored. A **Wish** is
something they want to try or buy. The **Palate** is their taste in prose, written to you: read it
before you recommend.

Search before you create: \`search_catalogue\` first, always. A Label you write from what you read
is marked unverified until the owner looks at it, and nothing waits for their approval — so a duplicate is a
real record they will have to find and merge by hand. What the search finds in Open Food Facts or
Vivino is a candidate to confirm with the owner, never a match: a small producer's bottle is often
on neither, and is then created from what the owner says. After every Tasting, ask the four guided
questions if they have not answered them: did you like it, how did it feel in the mouth, what did it
remind you of, with what food.`;

// JSON-RPC's own codes. This server adds none: a refusal from the model is an answer
// rather than an error, and it travels as a tool result (see `called`).
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type Message = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

/** A JSON-RPC correlation id. `null` where a malformed request carried none. */
type Id = string | number | null;

/**
 * The JSON-RPC message to send back, or `null` when there is nobody to send one to.
 *
 * `null` is the answer to a notification: it carries no id, so there is nothing to
 * correlate a reply with, and the transport asks for an empty 202 rather than a body.
 */
export type Answer = {
  readonly jsonrpc: "2.0";
  readonly id: Id;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
} | null;

/**
 * Answer one MCP message.
 *
 * `text` is the request body as it arrived, unparsed, because a malformed body is a
 * JSON-RPC parse error rather than an HTTP one and this is the layer that knows that.
 *
 * `mounted` is passed in rather than reached for — the framing and the tool list are
 * separate things — and it is a function rather than an array so that discovery happens
 * only when a method needs it. `initialize` and `ping` are answered without touching the
 * bundler's context module, which is what lets the door be exercised outside one.
 */
export async function answer(text: string, mounted: () => Promise<McpTool[]>): Promise<Answer> {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return failure(null, PARSE_ERROR, "That request body is not JSON.");
  }

  // Batching was removed from MCP in the 2025-06-18 revision, so an array is not a thing
  // this server has to unpick.
  if (Array.isArray(message)) {
    return failure(null, INVALID_REQUEST, "This server does not accept batched requests.");
  }

  const { id, method, params } = read(message);
  if (typeof method !== "string") {
    // `null` where there was no id: there is nothing to correlate the answer with, and
    // JSON-RPC's own answer to that is a null id rather than a missing one.
    return failure(id ?? null, INVALID_REQUEST, "A JSON-RPC request needs a `method`.");
  }

  // A notification: no id, so no answer. `notifications/initialized` is the only one a
  // client sends a tools-only server, and there is nothing for it to do — this server
  // keeps no session to mark as ready.
  if (id === undefined) return null;

  try {
    return await answered(id, method, params, mounted);
  } catch (error) {
    // A `Refusal` from a verb is domain vocabulary and is handled where the call was
    // made; anything reaching here is a bug in this app, so it becomes an internal error
    // with no prose invented for it. Nobody dresses a broken query up as advice.
    console.error("MCP request failed", { method, error });
    return failure(id, INTERNAL_ERROR, "That request failed inside the server.");
  }
}

async function answered(
  id: Id,
  method: string,
  params: unknown,
  mounted: () => Promise<McpTool[]>
): Promise<Answer> {
  switch (method) {
    case "initialize":
      return result(id, initialize(params));
    case "ping":
      // The spec's own keep-alive: an empty result, and the reason a connector can tell
      // "the token is wrong" from "the server is asleep".
      return result(id, {});
    case "tools/list":
      return result(id, { tools: listed(await mounted()) });
    case "tools/call":
      return await called(id, params, mounted);
    default:
      return failure(id, METHOD_NOT_FOUND, `This server does not implement \`${method}\`.`);
  }
}

function initialize(params: unknown) {
  const asked = readString(params, "protocolVersion");
  const spoken = SPOKEN_REVISIONS.find((revision) => revision === asked);

  return {
    protocolVersion: spoken ?? NEWEST,
    // Tools, and nothing else. There are no resources and no prompts here on purpose:
    // every question this app answers is a query with arguments, and a resource list
    // would be a second way to ask the same things.
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  };
}

// All three hints, on every tool, always — never two of them and never a default relied on.
//
// The protocol's own defaults are what makes stating them the only safe option: a missing
// `destructiveHint` reads as `true` and a missing `openWorldHint` reads as `true`, so a tool
// that says nothing is a tool described as destructive and unbounded — which is how
// tsundoku's door described every verb it had, until it stated all three.
//
// It is also what one client requires outright rather than prefers: OpenAI refuses a connector
// whose tools do not set `readOnlyHint`, `openWorldHint` and `destructiveHint` to true or false.
//
// `openWorldHint` is the tool's to declare, and `false` unless it does: every tool here
// reaches exactly one Postgres and the record it holds, except the two that ask a Source —
// `search_catalogue` and `create_label` (ADR-0011).
function listed(tools: McpTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      title: tool.title,
      readOnlyHint: tool.readOnly,
      // A read tool destroys nothing by construction, so this is not a second thing to
      // remember on every tool that only asks a question.
      destructiveHint: tool.readOnly ? false : (tool.destructive ?? false),
      openWorldHint: tool.openWorld ?? false,
    },
  }));
}

async function called(id: Id, params: unknown, mounted: () => Promise<McpTool[]>): Promise<Answer> {
  const name = readString(params, "name");
  const tool = (await mounted()).find((candidate) => candidate.name === name);
  if (!tool) {
    return failure(id, INVALID_PARAMS, `There is no tool called \`${name}\` here.`);
  }

  const input = readObject(params, "arguments");

  // **An argument this tool does not take refuses the call, by name.**
  //
  // Every schema on this door says `additionalProperties: false`, and this is what makes it
  // true. tsundoku learned why the hard way: a renamed argument sent by an assistant holding
  // the older tool list was read by nobody and dropped in silence, and the call recorded a
  // score attached to **nothing**. A client that photographs the tool list has no signal to
  // take another photograph (`./README.md`), so a stale argument name is the normal
  // consequence of shipping a rename — here, a Tasting recorded loose because the argument
  // that named its Vintage was spelled the old way. The refusal turns that into one sentence
  // the assistant can act on in the same turn.
  //
  // It names what the tool *does* take, because the reader is a program that can retry. And
  // it is the adapter's own business rather than a verb's: this is the wire contract, and
  // nothing in `src/core` knows an argument was ever sent by name.
  const declared = tool.inputSchema;
  if (declared.additionalProperties === false) {
    const known = new Set(Object.keys(declared.properties ?? {}));
    const unknown = Object.keys(input).filter((sent) => !known.has(sent));

    if (unknown.length > 0) {
      const takes = [...known].sort();
      return failure(
        id,
        INVALID_PARAMS,
        `\`${name}\` does not take ${unknown.map((sent) => `\`${sent}\``).join(", ")}. It takes ${
          takes.length === 0
            ? "no arguments at all"
            : takes.map((argument) => `\`${argument}\``).join(", ")
        }. If you are holding an older list of these tools, ask for it again.`
      );
    }
  }

  try {
    const answered = await tool.run(input);
    return result(id, {
      // Text, and pretty. An assistant reads this, and a JSON document it can quote back
      // to the owner is worth the extra bytes over one long line.
      content: [{ type: "text", text: JSON.stringify(answered, null, 2) }],
    });
  } catch (error) {
    // The one thing that is an *answer* rather than a failure: the model said no. A
    // refusal carries a stable code and prose written by the verb
    // (`src/core/refusal.ts`), and both cross this edge — the prose because an
    // assistant relays it to the owner, the code because an assistant that reads
    // `already-exists` can try something else where prose would only be re-guessed.
    //
    // A tool error is a *result* with `isError`, not a JSON-RPC error: the distinction is
    // the spec's, and it is what lets the assistant see the refusal and react instead of
    // the client reporting a transport fault.
    if (!isRefusal(error)) throw error;

    return result(id, {
      isError: true,
      content: [{ type: "text", text: error.message }],
      _meta: { "kanpai/refusal": { code: error.code } },
    });
  }
}

/** Read a message's three fields, distinguishing "absent" from "null". */
function read(message: unknown): { id: Id | undefined; method: unknown; params: unknown } {
  const record = (message ?? {}) as Message;
  const id = "id" in record ? (record.id as Id) : undefined;
  return { id, method: record.method, params: record.params };
}

function readString(params: unknown, key: string): string | undefined {
  const value = (params as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : undefined;
}

function readObject(params: unknown, key: string): Record<string, unknown> {
  const value = (params as Record<string, unknown> | null)?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function result(id: Id, payload: unknown): Answer {
  return { jsonrpc: "2.0", id, result: payload };
}

function failure(id: Id, code: number, message: string): Answer {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
