# The MCP door

The other door over the same core. The web view is a set of pages; this is one route
handler at `/mcp`, and both are **thin adapters over `src/core`** with no domain logic of
their own. It is tsundoku's door, taken over with its stack (ADR-0001): hand-rolled JSON-RPC,
no SDK, the directory as the tool list. Where it differs is the gate — tokens the owner
issues (ADR-0009), and OAuth's, from kanpai's own authorization server (ADR-0013) — and the
write boundary — the assistant creates Labels directly (ADR-0004).

This door is the product as much as the web view is: the owner is a beginner and the
assistant is their sommelier, so what the assistant reads here is what it knows.

```
src/app/mcp/route.ts     the door: the limit, the gate, the framing, then a response
src/lib/mcp/
├── bearer.ts            the gate: the token out of the header, checked against the issued ones
├── rate-limit.ts        what stands in front of the gate, and the only thing that remembers
├── protocol.ts          JSON-RPC and the four methods, and the instructions an assistant reads first
├── tool.ts              what one tool is, and how an argument is read
├── prose.ts             what several tools must say the same way: search first, the Vintage, the Rating, a candidate
├── tools.ts             the directory *is* the tool list — see below
└── tools/               one file per area
    ├── catalogue.ts     search_catalogue — our Labels, then the Sources' candidates (ADR-0011)
    ├── label.ts         get_label, create_label, link_label_source
    ├── kind.ts          list_kinds
    ├── tasting.ts       record_tasting, edit_tasting, read_tastings
    ├── bottle.ts        add_bottles, update_bottle
    ├── vintage.ts       set_vintage_year
    ├── cellar.ts        read_cellar
    ├── wish.ts          add_wish, read_wishes, close_wish
    └── palate.ts        read_palate, update_palate
```

## Exposing a query over MCP is one new file

**Add `src/lib/mcp/tools/<area>.ts`, or a tool to the area's file. Do not edit the route, do
not edit `tools.ts`, and there is no barrel to add a line to.** Every file in `tools/` is
discovered and mounted — the same argument `src/core/README.md` makes for having no
`index.ts`. The file default-exports its tools, and that is the whole contract:

```ts
import { readCellar } from "@/core/queries/cellar";
import type { McpTool } from "../tool.ts";

const read: McpTool = {
  name: "read_cellar",
  title: "Read the Cellar",
  description: `The **Cellar**: every Bottle in the house that is closed or open — …`,
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  readOnly: true,
  async run() {
    return { cellar: await readCellar() };
  },
};

export default [read];
```

Five rules, and they are the review surface:

1. **One file per area, named for the area** in the vocabulary of `CONTEXT.md`. A file whose
   name has a second dot is not mounted, so a test may sit beside an area.
2. **The tool calls a query or a verb and returns what it got.** No SQL, no `if` about the
   model. What it may do is read its arguments — `stringArgument`, `numberArgument`,
   `datingArgument`, `vintageArgument` in `tool.ts` — and refuse a call it cannot read, in
   prose. If the web view would need the same thing, it belongs in `src/core`.
3. **`name` is what the assistant does, as spec §3 names it** — `record_tasting`,
   `read_cellar` — verb first, not tsundoku's `area_question`. Renaming one breaks every
   connected client (below), so a new name is chosen once.
4. **`description` is product, not a label**, in the owner's words: what a Vintage, a Level
   or a Rating *is* is said where the assistant reads it, because it teaches a beginner from
   it. A tool described as "list bottles" gets called for the wrong question.
5. **All three hints, always.** `readOnly` means it; a write that takes away something that
   cannot be put back also says `destructive: true` — `update_palate`, which replaces prose
   the owner wrote. A tool that may ask a Source over the network says `openWorld: true` —
   `search_catalogue`, `create_label` and `link_label_source`, and nothing else. `protocol.ts` states
   `readOnlyHint`, `destructiveHint` and `openWorldHint` on every tool, because the protocol
   reads a missing one as the worst case and OpenAI refuses a connector without them.

## The write boundary

**The assistant creates Labels directly, and the ones it writes are born unverified** (ADR-0004). This is
where the door parts from tsundoku's, which only *proposes* through an Inbox: here the flow
that matters is a photo at a restaurant table of a bottle nobody has catalogued, and a
Tasting left dangling until the owner got home is the friction they rejected every other app
for. There is no Inbox and nothing waits for approval. `create_label` passes
`unverified: true` for a Label written from what was read or said; the owner's to-check page
(S4) is where a wrong one is found, corrected or merged. A Label made from a candidate
(`source` + `id_at_source`) is born checked, as it is from any door: its facts are the
Source's, and putting them on the to-check list only made it noise (ADR-0004, amended
2026-10-12).

What stands in for the Inbox is prose, and it is said once. **A tool that may lead to a new
Label says *search first* and what a duplicate costs**, in `SEARCH_FIRST` from `prose.ts`:
`create_label`, `search_catalogue`, `record_tasting` and `add_bottles` all spend it, rather than
each wording it its own way — tsundoku had every read tool needed to avoid a duplicate and
assistants made them anyway until the instruction was one sentence spent everywhere. Likewise
`VINTAGE` — *unknown, never NV, when the year isn't known; NV only when the producer blends
years* (ADR-0010) — is in every tool that names a Vintage, and `tools.test.ts` holds both.

The Sources add a third, `CANDIDATES` (ADR-0011): **a candidate from Open Food Facts or Vivino
is a proposal, never a match**, the first one is not to be trusted, and a craft bottle no
Source knows is created from what the owner says. `search_catalogue`, `create_label` and `link_label_source` all
spend it. A Label made from a candidate names it by `source` and `id_at_source` only; the core
reads the record again from the Source rather than trusting the fields an assistant relayed,
and records the Source with the Label in one transaction. Which Sources a copy asks is read
from its environment by `src/core/sources/configured.ts`, in the tool, and handed to the core
as an argument — the test run turns them all off, so no test reaches a third party.

**A Label that has none is given its Source with `link_label_source`** — one imported from a
Vivino export, which links a Vintage's page rather than the wine's id, or one written by hand.
It takes the Label's id and a candidate's `source` and `id_at_source`, exactly as `create_label`
takes one, re-reads it and records it in the same shape (`linkLabelToSource`). Its description
says to show the owner the candidate and link it only after they say yes. It changes nothing
the Label says and not whether it is checked: a photo and a page vouch for no fact an assistant
wrote. A record already on another Label is refused naming that Label — the two are one, and
merging is the owner's.

Everything else here acts on what exists: a Tasting on a Vintage or loose, Bottles into the
Cellar, a Bottle opened or finished, a year learned, a Wish added or closed, the Palate
rewritten. **Nothing deletes**: there is no tool to strike a Tasting, delete a Bottle or merge
Labels. Those are the owner's, from the web view.

**A Tasting is edited, not recorded again** (ADR-0003, amended 2026-10-13). One Tasting is
filled in over a conversation — recorded, then the four guided questions asked — and before
`edit_tasting` existed an assistant with no way to amend one recorded the answers as a second
Tasting, a duplicate the owner could not remove. So `edit_tasting` amends a Tasting by its id
(`read_tastings` gives every one's), and `record_tasting` and the server's instructions both say
the answers go there. It is not `destructive`: it amends, and its description tells the assistant
to ask before overwriting what the owner wrote. A field left out stays; `null` clears one.

A Bottle or a Tasting names its Vintage by `vintage_id`, or by `label` with `vintage` — a
year, `"nv"` or `"unknown"` — which finds that Vintage or creates it in the same transaction
as the write (`vintageIdOf` in `src/core/verbs/vintage.ts`). Half of the second form is
refused rather than completed: a `label` with no `vintage` read as *unknown* is exactly the
guess ADR-0010 says not to make silently.

### A refusal is already handled

Do not catch one. A verb the database refuses throws a `Refusal` with a stable code and prose
(`src/core/refusal.ts`), and `protocol.ts` turns it into a tool result with `isError`, the
prose as its text, and the code under `_meta["kanpai/refusal"]` — the prose because the
assistant relays it, the code because an assistant that reads `already-exists` can try
something else. Anything that is not a `Refusal` becomes an internal error with no prose
invented for it.

### How the directory becomes the list

`tools.ts` asks the application's bundler for a context module over `tools/`, resolved at
build time — verified against `next dev`, a production `next build`, and the published image.
It is deliberately **not** a filesystem read: the source tree is not shipped. It therefore
does not work outside the bundler, so the route's own test asks for `initialize` and never
for `tools/list`, and `tools.test.ts` walks the directory itself with the same pattern —
holding every tool to a closed schema and the shared prose, and driving the S2 flow through
`answer`.

### Adding or renaming a tool does not reach a connected client

`initialize` answers `capabilities: { tools: { listChanged: false } }`, which is the truth for
a stateless door with no stream — and so **a client that photographed the list has no signal
to take another photograph**. tsundoku found it the hard way: ChatGPT went on listing the
tools it had seen the evening before. After a deploy that changes the list, remove and re-add
the connector (and, for ChatGPT, restart the tunnel client first — S5). The door refuses an
argument a tool does not declare with `-32602`, naming what it does take, which turns a stale
photograph into one sentence an assistant can act on rather than a wrong record.

## The gate

`/mcp` takes **bearer tokens the owner issues** and not Google (ADR-0009). A redirect to a
consent screen is not an answer an assistant can read, so `src/proxy.ts` excludes this path
from the Google matcher by name — which means `bearer.ts` is the only thing in front of the
owner's record here.

- **Tokens are records**, in `access_tokens`: named after where they went (*Claude*,
  *laptop*, *tunnel*), shown once, stored as a SHA-256, revoked one by one, with a last-used
  time touched at most once a minute. The verbs are `src/core/verbs/access-token.ts`; the gate
  only reads the header and asks `authenticateAccessToken`.
- It **fails closed**: with no token issued, nothing matches and every request is refused.
  There is no development opt-in beside it, unlike the owner gate: a token is one command
  away (`pnpm token:issue`), so there is nothing for an opt-in to stand in for.
- **A token is looked up by its hash**, and that lookup is the constant-time comparison: how
  fast an index answers depends on the hash, which the caller controls only through a
  preimage.
- Every refusal is the same 401 with the same body. Which one it was — `absent`,
  `none-issued`, `unknown`, `revoked` — is logged for the owner and never returned.
- `WWW-Authenticate: Bearer realm="kanpai", resource_metadata="…/.well-known/oauth-protected-resource/mcp"`:
  that is how a client given only this address discovers kanpai's own authorization server
  (ADR-0013). OAuth's access tokens are rows in the same table, an hour long and tied to a
  grant, and this check did not change to take them — `authenticateAccessToken` also refuses
  one that has expired (`expired`) or whose grant was revoked.
- **ChatGPT is not a special case.** The Secure MCP Tunnel is transport only and presents a
  token issued for it, like any other client; there is no tunnel path through the gate, and
  there must not be one.
- **The rate limit is in front of the gate**, because every token check is a database query
  and an endpoint that answers one to anyone who asks can be made to query forever. Two fixed
  windows of a minute: thirty requests per client, three hundred over the whole door; a 429
  carries `Retry-After`. The counters live in this process, which assumes one replica —
  `rate-limit.ts` says why that is an assumption and not an oversight.

## OAuth (ADR-0013)

kanpai is the authorization server for this door. The endpoints are route handlers beside it,
thin over `src/core/verbs/oauth.ts`, with what they share in `src/lib/oauth/`:

```
src/app/.well-known/oauth-protected-resource[/mcp]    RFC 9728: /mcp, and who issues its tokens
src/app/.well-known/oauth-authorization-server[/mcp]  RFC 8414: every endpoint below
src/app/oauth/register    RFC 7591: an app registers itself; public clients only
src/app/(consent)/oauth/authorize    the consent screen, behind the owner gate
src/app/oauth/token       a code (S256 PKCE) or a refresh token for an access token
src/app/oauth/revoke      RFC 7009: an app disconnects itself
```

The flow, as ChatGPT walks it: a 401 here names the resource metadata; that names kanpai as
the authorization server; the app registers, opens `/oauth/authorize` in the owner's browser
(through the Google sign-in if there is no session, and back), the owner presses *Allow*, and
the app redeems the code for an hour-long `kanpai_at_…` and a `kanpai_rt_…` that rotates on
every refresh. `/settings` lists the grant as a connected app and revokes it. The endpoints an
app calls are outside the Google gate, answer any origin, and have a rate limit of their own;
`/oauth/authorize` is gated like every screen.

## The transport

**Streamable HTTP, statelessly.** One POST carries one JSON-RPC message and gets one JSON
response: no session id, no SSE stream, nothing to resume, so the container can restart under
a connected assistant without it noticing. Four methods: `initialize`, `ping`, `tools/list`,
`tools/call`. A notification gets an empty 202; `GET` gets 405.

## Trying it

```sh
pnpm token:issue curl     # prints the secret once
pnpm dev
curl -s http://localhost:3000/mcp \
  -H "authorization: Bearer kanpai_…" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

Without the header, or with a revoked token, it is a 401 (`src/app/mcp/route.test.ts`). The
root `README.md` has the Claude Code and Claude Desktop instructions. The OAuth flow, end to end
against the route handlers, is `src/app/oauth/oauth.test.ts`.
