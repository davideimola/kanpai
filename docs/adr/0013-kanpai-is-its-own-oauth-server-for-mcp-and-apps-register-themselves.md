# kanpai is its own OAuth server for MCP, and apps register themselves

Built in S10, on 2026-10-13, when ChatGPT's *Add custom MCP server* dialog — given
`https://<domain>/mcp` and *OAuth* — answered that it could not find the OAuth settings. Its
connector takes no static token, and the Secure MCP Tunnel (ADR-0009, path 2) is a second
moving part on the owner's cluster and none at all on anyone else's copy. This is ADR-0009's
path 3, built.

**kanpai is the authorization server for its own `/mcp`.** No Auth0, no Keycloak, no second
service: the owner already signs in with Google (ADR-0001), and an OAuth authorization server
for one owner and one resource is four tables' worth of moves on top of that sign-in.

- **Discovery.** The 401 on `/mcp` carries `resource_metadata` (RFC 9728 §5.1), pointing at
  `/.well-known/oauth-protected-resource/mcp`, which names kanpai as the authorization server;
  `/.well-known/oauth-authorization-server` (RFC 8414) names every endpoint. Both are also served
  at the other address a client may try (the root form, and the `/mcp`-suffixed form). Not
  `/.well-known/openid-configuration`: kanpai is not an OpenID provider, issues no ID token, and
  a discovery document saying otherwise would be a promise. The issuer is `AUTH_URL`'s origin —
  the public origin a copy already sets for Auth.js — or, in the local loop, the request's.
- **Registration is Dynamic Client Registration (RFC 7591), not Client ID Metadata Documents.**
  The MCP spec's newest revision prefers CIMD and keeps DCR for compatibility, but both ChatGPT
  and Claude fall back to DCR when a server does not advertise CIMD, so DCR alone connects
  everything this is for. CIMD means fetching a URL the client names, from the server, during
  the flow: an outbound request to an address chosen by whoever is calling, which is an SSRF
  surface this app otherwise does not have (the Sources it asks are fixed, ADR-0011). It can be
  added beside DCR later, behind an allowlist of hosts, without changing anything here.
- **Anyone may register, and that grants nothing.** A registration is a name and the addresses
  a code may be sent back to — https, or http to loopback only. Access starts when the owner
  presses *Allow*. Public clients only (`token_endpoint_auth_method: none`, PKCE required); an
  app asking for a secret is registered without one, and the answer says so (RFC 7591 lets the
  server decide). Registration and the token endpoint are rate limited, with counters of their
  own beside the door's.
- **Consent is a page behind the owner gate.** `/oauth/authorize` is gated like every screen
  over the record, and lives in a third route group, `(consent)`, only so it is not drawn
  inside the owner's shell: one question — *ChatGPT wants to read and write your kanpai* — and
  two buttons, then back to the app with `code`, `state` and `iss` (RFC 9207). An unknown
  `client_id` or an address the app did not register stops on a page and redirects nowhere;
  every other mistake goes back to the app as an error. The name on the screen is the app's own
  claim, so the screen says where it will send the owner, too.
- **One scope, `kanpai`.** One owner, one record; there is nothing narrower to grant, and a
  scope the door did not enforce would be a label, not a limit.

## Codes, grants, and access tokens that stay in one table

ADR-0009's consequence was that **one table holds every credential the door accepts**, so the
check on `/mcp` is written once and OAuth adds rows, not a second path. That holds:

- `oauth_clients` — what DCR wrote. The id (`cli_…`) is the `client_id`.
- `oauth_codes` — the owner's yes, hashed, **five minutes**, single use, bound to the app, the
  redirect address and an S256 challenge. A code is burnt the first time it is presented, so a
  wrong verifier is one guess; presented again, it **revokes the grant its first use made**
  (OAuth 2.1 §4.1.3).
- `oauth_grants` — what `/settings` lists as a **connected app**, named after the app. It holds
  the app's one refresh token as a hash that **rotates on every refresh** — the one thing here
  allowed to change a secret, which access tokens never do — and it has no expiry: it lives until
  the owner disconnects it, or the app revokes it (RFC 7009). A revocation is final, by trigger.
- `access_tokens` — OAuth's access tokens are rows here, with a `grant_id` and an `expires_at`
  that go together, **one hour** long. `authenticateAccessToken` lets both kinds in by the same
  query, and refuses one that has expired or whose grant is revoked. Revoking a grant revokes its
  tokens in the same transaction. The owner's own tokens are unchanged: no grant, no expiry, and
  the only ones whose names must be unique while live, and the only ones `/settings` lists as
  access tokens.

Kept, OAuth's access tokens would be twenty-four rows a day per app, each refused already, so a
grant's **expired** ones are deleted when it is refreshed — the one deletion in a table whose
owner-issued rows are never deleted, because what those would answer (*when did this app last
call?*) is on the grant.

Secrets are `kanpai_at_…` and `kanpai_rt_…` and 32 random bytes, stored as SHA-256 and looked up
by it, as ADR-0009's are. The PKCE verifier is the one comparison that is not a lookup, and it
is `timingSafeEqual`.

Tokens carry no audience claim: they are opaque, and a row in this table is good at this door
and nowhere else, which is what an audience would have said. A `resource` that names another
server is refused at both the authorization and the token endpoint.

## Signing in on the way

The proxy sends a refused request to `/signin` with no destination, on purpose (`src/proxy.ts`):
a destination read from a query parameter is an open redirect for the price of a convenience.
**The consent screen is the one exception**, because there returning *is* the feature — an app
is waiting for the answer. The proxy carries an authorization request alone through as `next`,
and the sign-in honours `next` only if it starts with `/oauth/authorize?`; anything else lands
home. A prefix and nothing cleverer: a string that starts that way is a path on this host, and
the consent page judges the query again before showing anything.

## Consequences

- **ChatGPT connects with the address alone**: `https://<domain>/mcp`, authentication *OAuth*,
  advanced settings left on automatic (DCR). So do Claude's custom connectors and Claude Code.
  The Secure MCP Tunnel stops being needed for ChatGPT; it keeps working, with a token issued
  for it.
- **Owner-issued tokens keep working unchanged**, for anything scripted and anything that takes
  a header.
- **A rotated refresh token presented again is refused, not treated as theft.** Detecting reuse
  would mean keeping every refresh token a grant ever had; refusing it is enough for one owner,
  who sees the app on `/settings` and can disconnect it.
- **Registrations accumulate.** Each connection from ChatGPT registers anew, and a row with no
  grant is harmless and small. Sweeping old unused ones is a later chore, not a design question.
- **The counters assume one replica**, as the door's do (`src/lib/mcp/rate-limit.ts`).
