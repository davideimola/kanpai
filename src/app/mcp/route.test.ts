import { beforeEach, describe, expect, it } from "vitest";

import { query } from "@/core/db";
import { issueAccessToken, revokeAccessToken } from "@/core/verbs/access-token";
import { PER_CLIENT } from "@/lib/mcp/rate-limit";

import { GET, POST } from "./route";

// Seam 2, the other half of it. `src/proxy.test.ts` covers the Google gate over the web
// view; this covers the door beside it, which takes the tokens the owner issues and not
// Google (ADR-0009).
//
// Same posture and same thinness as tsundoku's: a real `Request`, the real route handler, no
// mock of the thing under test. Where it parts from tsundoku is the database: a token is a
// record here, not a string in the environment, so the gate is asked against real rows —
// issued, revoked, and none at all.
//
// The happy path asks for `initialize` and `ping` deliberately. They are the methods that
// prove the request got past the gate and was answered as MCP without reaching a tool: the
// tool areas are discovered by the application's bundler (see `src/lib/mcp/README.md`),
// which is not what runs a vitest file.

let token: string;

beforeEach(async () => {
  await query("truncate access_tokens");
  token = (await issueAccessToken("a test")).secret;
});

/**
 * A distinct caller for every request in this file.
 *
 * The rate limiter in front of the gate counts per client and remembers between requests
 * (`@/lib/mcp/rate-limit`), so a file that let every case share one address would be a
 * file whose last cases fail once somebody adds a few more.
 */
let callers = 0;

function fromSomewhereNew(): string {
  callers += 1;
  return `198.51.100.${callers}`;
}

/** A `ping` — the cheapest well-formed request there is — with `authorization`. */
function post(
  authorization?: string,
  body: unknown = { jsonrpc: "2.0", id: 1, method: "ping" },
  client: string = fromSomewhereNew()
) {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": client });
  if (authorization !== undefined) headers.set("authorization", authorization);
  return new Request("https://kanpai.example.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("the bearer gate at the HTTP edge", () => {
  it("refuses a request carrying no token at all", async () => {
    const response = await POST(post());

    expect(response.status).toBe(401);
    // So that a client is told *how* to authenticate rather than left to guess, which is
    // what RFC 6750 asks of a 401 and what lets a connector report something useful.
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer /);
  });

  it("refuses a token nobody issued", async () => {
    expect((await POST(post(`Bearer ${token}-but-not-quite`))).status).toBe(401);
    expect((await POST(post(`Bearer ${token.slice(0, -1)}`))).status).toBe(401);
  });

  it("refuses another scheme carrying the right secret", async () => {
    expect((await POST(post(`Basic ${token}`))).status).toBe(401);
  });

  it("refuses an empty bearer", async () => {
    expect((await POST(post("Bearer "))).status).toBe(401);
  });

  it("refuses a token the owner revoked", async () => {
    const [issued] = await query<{ id: string }>("select id from access_tokens");
    await revokeAccessToken(issued?.id ?? "");

    expect((await POST(post(`Bearer ${token}`))).status).toBe(401);
  });

  // Fail closed: a fresh copy, before its owner has issued a token, answers nobody.
  it("refuses everything while no token is issued", async () => {
    await query("truncate access_tokens");

    expect((await POST(post(`Bearer ${token}`))).status).toBe(401);
    expect((await POST(post())).status).toBe(401);
  });

  it("answers a request carrying a token the owner issued", async () => {
    const response = await POST(
      post(`Bearer ${token}`, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "a test" } },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "kanpai" },
      },
    });
  });

  it("answers every live token, not only the first", async () => {
    const second = await issueAccessToken("tunnel");
    expect((await POST(post(`Bearer ${second.secret}`))).status).toBe(200);
    expect((await POST(post(`Bearer ${token}`))).status).toBe(200);
  });

  it("records when the token was last used", async () => {
    await POST(post(`Bearer ${token}`));
    const [row] = await query<{ last_used_at: Date | null }>(
      "select last_used_at from access_tokens"
    );
    expect(row?.last_used_at).toBeInstanceOf(Date);
  });

  // The scheme is case-insensitive by RFC 7235, and a client that sends `bearer` is
  // right. Nothing else about the token is.
  it("accepts the scheme in any case", async () => {
    expect((await POST(post(`bearer ${token}`))).status).toBe(200);
  });

  // The gate is the whole endpoint and not one method of it. There is no SSE stream to
  // open here, so a GET is answered 405 — but only once it has proved who it is.
  it("stands in front of every method, not only POST", async () => {
    expect((await GET(post())).status).toBe(401);
    expect((await GET(post(`Bearer ${token}`))).status).toBe(405);
  });
});

// The one thing about the tools that is testable from here, and the one worth testing:
// **this door never reports an empty tool list.** The list is the `tools/` directory,
// resolved by the application's bundler, so a vitest file cannot ask what is in it — which is
// exactly the shape of the failure this pins: every way discovery can break arrives as zero
// tools, the door still answers, and the assistant reports that there is nothing here.
describe("the tool list", () => {
  it("is an error rather than an empty list when discovery cannot answer", async () => {
    const response = await POST(
      post(`Bearer ${token}`, { jsonrpc: "2.0", id: 1, method: "tools/list" })
    );

    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: -32603 } });
  });
});

// **The limit stands in front of the gate and not behind it.** A caller with no token at all
// must run out of requests, because that is the caller the limit exists for — and here every
// refusal they buy would otherwise be a database query.
//
// One flood, and everything asserted off it: the limiter is a module singleton, so its
// ceiling over the whole door is shared by every request this file makes.
describe("the rate limit in front of the gate", () => {
  const FLOODER = "203.0.113.11";

  it("runs out of requests for a caller who never presents a token", async () => {
    const spent: number[] = [];
    for (let n = 0; n < PER_CLIENT; n += 1) {
      spent.push((await POST(post(undefined, undefined, FLOODER))).status);
    }
    expect(spent).toEqual(Array(PER_CLIENT).fill(401));

    const refused = await POST(post(undefined, undefined, FLOODER));

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    // Nothing about the gate leaks out of a 429: the token is never looked at.
    expect(refused.headers.get("www-authenticate")).toBeNull();

    // The owner's own assistant is subject to the same limit: exempting a correct token
    // would put the database lookup back in front of the limiter.
    expect((await POST(post(`Bearer ${token}`, undefined, FLOODER))).status).toBe(429);

    // And none of it is charged to anybody else.
    expect((await POST(post(`Bearer ${token}`, undefined, "203.0.113.12"))).status).toBe(200);
  });
});
