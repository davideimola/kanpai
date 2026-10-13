// Where this copy is, as OAuth needs it said: the **issuer** (the authorization server, which
// kanpai is) and the **resource** (`/mcp`, which kanpai also is). ADR-0013.
//
// Both are derived from one origin, and the origin comes from one place. Every document, every
// redirect's `iss` and every `WWW-Authenticate` names it, and a client compares them: an issuer
// that came out `http://0.0.0.0:3000` on one request and `https://kanpai.example.com` on the
// next is an authorization server the client refuses to talk to (RFC 8414 §3.3, RFC 9207).
//
// **`AUTH_URL` first.** It is the public origin a deployed copy already sets for Auth.js
// (`.env.example`), it is what a TLS terminator in front of the container hides from the
// request, and it is the operator's word rather than the caller's. Without it — the local loop —
// the request's own forwarded host and protocol, then its URL. A caller can make those say
// anything, and the documents it is then shown name an issuer only it believes in: nothing it
// can do with that, since every code still comes back to this host.

/** The headers that say where a request was sent, as a proxy in front of the app writes them. */
type Arrived = { headers: Headers; url: string };

/** The public origin of this copy, with no trailing slash: `https://kanpai.example.com`. */
export function originOf(arrived: Arrived): string {
  const configured = process.env.AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // A malformed AUTH_URL is Auth.js's to complain about; this falls back to the request.
    }
  }

  const url = new URL(arrived.url);
  const host =
    arrived.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    arrived.headers.get("host") ||
    url.host;
  const protocol =
    arrived.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}

/** The authorization server's identifier. The origin itself, with no path (RFC 8414 §2). */
export function issuerOf(origin: string): string {
  return origin;
}

/** The protected resource: the MCP door. What a client pastes into its connector dialog. */
export function resourceOf(origin: string): string {
  return `${origin}/mcp`;
}

/** Where the resource's metadata is served — the path-suffixed form RFC 9728 §3.1 builds from `/mcp`. */
export function resourceMetadataOf(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

/**
 * Whether a `resource` parameter (RFC 8707) names this copy's door.
 *
 * Absent is fine: the parameter is the client's to send, and this server has one resource. A
 * trailing slash is forgiven, and so is the bare origin — a client that was handed the server's
 * address without `/mcp` means the same door, and there is no other one a token here could be
 * for. Anything else is a token asked for somebody else's resource, and is refused.
 */
export function resourceMatches(resource: string | null | undefined, origin: string): boolean {
  if (resource === null || resource === undefined || resource === "") return true;
  const trimmed = resource.replace(/\/+$/, "");
  return trimmed === resourceOf(origin) || trimmed === origin;
}

/**
 * The same origin, for a page or a Server Function, which have the request's headers and not
 * its URL. The host header stands in for the URL; with `AUTH_URL` set, neither is read.
 */
export function originOfHeaders(headers: Headers): string {
  return originOf({ headers, url: `http://${headers.get("host") ?? "localhost"}` });
}
