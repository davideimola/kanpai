# The MCP door takes tokens the owner issues, and OAuth comes later

Status: **path 3 built in S10** —
[ADR-0013](0013-kanpai-is-its-own-oauth-server-for-mcp-and-apps-register-themselves.md) records
kanpai as its own OAuth server for `/mcp`, with its access tokens as rows in this ADR's one table.

`/mcp` is reached three ways, and all three end at the same check:

1. **Bearer tokens the owner issues from the web view** — named (*Claude*, *laptop*, *tunnel*),
   shown once, stored only as a hash, revocable one by one, with a last-used time. This is how
   Claude's custom connectors, Claude Code and anything scripted get in.
2. **OpenAI's Secure MCP Tunnel**, for ChatGPT, which cannot present a bearer. The tunnel is
   transport only: it presents one of the tokens above, issued for it. On the owner's cluster it
   is a second channel on the existing `tunnel-client`.
3. **OAuth 2.1** (S10, built: ADR-0013). kanpai becomes its own authorization server for MCP: discovery
   metadata, dynamic client registration, `/authorize` behind the existing owner sign-in with a
   consent screen, `/token` with PKCE and refresh. It is what lets someone else's copy work with
   ChatGPT with no OpenAI platform account and no tunnel.

tsundoku has one static token in an environment variable. That is enough for one client and
wrong for several: rotating it breaks every client at once, and nothing says which one called.
Issuing tokens from the web costs one table and one settings screen.

## Consequences

- **One table holds every credential the door accepts**, issued tokens now and OAuth access
  tokens later, so the check on `/mcp` is written once and OAuth adds rows, not a second path.
- **The door fails closed**: with no token issued, every request is refused. A first token is
  created from the web view after signing in — or, for a fresh copy with no browser at hand, by
  a one-off CLI command.
- **OAuth is built only when it is needed**: when a copy other than the owner's wants ChatGPT,
  or when the tunnel stops being acceptable. Until then it is a slice in the spec, not code.
  (It was needed on 2026-10-13, when ChatGPT's connector dialog asked for OAuth and nothing
  else: ADR-0013.)
