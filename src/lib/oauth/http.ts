import { clientOf, createRateLimiter } from "@/lib/mcp/rate-limit";

// What every OAuth endpoint a machine calls has in common (ADR-0013): it answers any origin, it
// reads a body that may be a form or JSON, it refuses in RFC 6749's words, and it is limited.
//
// **Any origin**, because the callers are not this site's pages. A browser-based MCP client —
// the MCP inspector is one — fetches the metadata, registers and redeems its code from its own
// origin, and without `Access-Control-Allow-Origin` its browser drops the answer. That is safe
// here for the reason it is safe on any token endpoint: nothing on these endpoints reads a
// cookie, so a page on another origin learns nothing it could not learn with `curl`. The one
// endpoint that does read the owner's session, `/oauth/authorize`, is a page a person opens,
// and it sends no such header.

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

/** `response`, answerable from any origin. */
export function withCors(response: Response): Response {
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value);
  return response;
}

/** The answer to a CORS preflight: yes, with no body. */
export function preflight(): Response {
  return withCors(new Response(null, { status: 204 }));
}

/** JSON that must not be cached — every answer carrying a token, and every refusal of one. */
export function noStore(body: unknown, status = 200): Response {
  return withCors(
    Response.json(body, {
      status,
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    })
  );
}

/**
 * A refusal in the protocol's words: `{ error, error_description }` (RFC 6749 §5.2, RFC 7591
 * §3.2.2). `error` is what a client acts on; the description is a sentence for whoever reads its
 * log, and says what was wrong with the request — never which secret exists.
 */
export function oauthError(error: string, description: string, status = 400): Response {
  const response = noStore({ error, error_description: description }, status);
  // RFC 6749 §5.2: a 401 for a client that failed to authenticate carries a challenge.
  if (status === 401) response.headers.set("www-authenticate", 'Basic realm="kanpai"');
  return response;
}

/**
 * The parameters of a POST: a form, as RFC 6749 says a token request is, or JSON, which some
 * clients send anyway and nothing is gained by refusing. A body that is neither is no
 * parameters at all, and the endpoint says which one it missed.
 */
export async function paramsOf(request: Request): Promise<Map<string, string>> {
  const params = new Map<string, string>();
  const type = request.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await request.text().catch(() => "");

  if (type.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "string") params.set(key, value);
        }
      }
    } catch {
      // Not JSON after all: no parameters, and the endpoint names the first one it needed.
    }
    return params;
  }

  for (const [key, value] of new URLSearchParams(body)) {
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

/**
 * The `client_id` out of HTTP Basic, for a client that authenticates that way although it was
 * registered as public. Its secret is ignored: none was issued, so there is none to check, and
 * refusing the client for sending one would only break it.
 */
export function basicClientId(authorization: string | null): string | null {
  const match = /^Basic +(\S+)$/i.exec(authorization?.trim() ?? "");
  if (!match?.[1]) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const id = decodeURIComponent(decoded.split(":")[0] ?? "");
    return id || null;
  } catch {
    return null;
  }
}

/**
 * The limit in front of the endpoints that write a row for anyone who asks — registering, and
 * redeeming — for the reason `@/lib/mcp/rate-limit` gives for the door: a refusal that costs a
 * query is still one somebody can buy millions of.
 *
 * Its own counters, not the door's: an app registering and redeeming a code is a handful of
 * requests once, and it should neither spend the allowance an assistant needs on `/mcp` nor be
 * refused because one is busy there.
 */
const limiter = createRateLimiter();

/** A 429 if this request does not fit in the OAuth endpoints' allowance, or `null` if it does. */
export function refuseAFlood(request: Request): Response | null {
  const client = clientOf(request.headers);
  const verdict = limiter(client, Date.now());
  if (verdict.ok) return null;

  console.warn("OAuth request rate limited", { client, path: new URL(request.url).pathname });
  const response = oauthError("slow_down", "Too many requests. Wait, then ask again.", 429);
  response.headers.set("retry-after", String(verdict.retryAfterInSeconds));
  return response;
}
