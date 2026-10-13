import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { query } from "@/core/db";
import { issueAuthorizationCode } from "@/core/verbs/oauth";
import { judgeAuthorizationRequest } from "@/lib/oauth/authorize";
import { GET as authorizationServer } from "../.well-known/oauth-authorization-server/route";
import { GET as protectedResource } from "../.well-known/oauth-protected-resource/mcp/route";
import { POST as mcp } from "../mcp/route";
import { POST as register, OPTIONS as registerPreflight } from "./register/route";
import { POST as revoke } from "./revoke/route";
import { POST as token } from "./token/route";

// Seam 2, for OAuth (ADR-0013): real `Request`s to the real route handlers, against real rows —
// the way ChatGPT walks it. Discovery from a 401 on `/mcp`, registration, the owner's yes, the
// code redeemed, `/mcp` answered with the access token, a refresh, a revocation.
//
// The consent screen is a page and pages are not rendered here (`vitest.config.ts`), so the
// owner's yes is what its Server Function does: judge the request, then issue the code.

const ORIGIN = "https://kanpai.example.com";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

let saved: string | undefined;

beforeEach(async () => {
  await query("truncate access_tokens, oauth_codes, oauth_grants, oauth_clients");
  saved = process.env.AUTH_URL;
  delete process.env.AUTH_URL;
});

afterEach(() => {
  if (saved === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = saved;
});

/** A distinct caller for every request, for the reason `../mcp/route.test.ts` gives. */
let callers = 0;
function somewhereNew(): string {
  callers += 1;
  return `203.0.113.${callers % 250}`;
}

function at(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", somewhereNew());
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

function json(path: string, body: unknown): Request {
  return at(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function form(path: string, fields: Record<string, string>): Request {
  return at(path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function registered(): Promise<string> {
  const response = await register(
    json("/oauth/register", { client_name: "ChatGPT", redirect_uris: [REDIRECT] })
  );
  return ((await response.json()) as { client_id: string }).client_id;
}

/** What the consent screen's *Allow* does, for a request built as an app builds it. */
async function allow(clientId: string, challenge: string): Promise<string> {
  const asked = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${ORIGIN}/mcp`,
  });
  const verdict = await judgeAuthorizationRequest(asked, ORIGIN);
  if (verdict.kind !== "ask") throw new Error(`expected the consent screen, got ${verdict.kind}`);
  return issueAuthorizationCode(verdict.request);
}

function ping(accessToken?: string): Request {
  return at("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
}

describe("discovery", () => {
  it("starts from a 401 on /mcp that names the resource metadata", async () => {
    const refused = await mcp(ping());
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe(
      `Bearer realm="kanpai", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  it("names kanpai as the authorization server for /mcp", async () => {
    const response = protectedResource(at("/.well-known/oauth-protected-resource/mcp"));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      resource: `${ORIGIN}/mcp`,
      authorization_servers: [ORIGIN],
      bearer_methods_supported: ["header"],
      scopes_supported: ["kanpai"],
      resource_name: "kanpai",
    });
  });

  it("says where every endpoint is, and what it supports", async () => {
    const metadata = await authorizationServer(
      at("/.well-known/oauth-authorization-server")
    ).json();
    expect(metadata).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      revocation_endpoint: `${ORIGIN}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["kanpai"],
      authorization_response_iss_parameter_supported: true,
    });
  });

  it("names the configured public origin, whatever the request arrived as", async () => {
    process.env.AUTH_URL = "https://kanpai.davideimola.dev/";
    const metadata = (await authorizationServer(
      new Request("http://0.0.0.0:3000/.well-known/oauth-authorization-server")
    ).json()) as { issuer: string };
    expect(metadata.issuer).toBe("https://kanpai.davideimola.dev");
  });
});

describe("registration", () => {
  it("registers a public client, even one that asked for a secret", async () => {
    const response = await register(
      json("/oauth/register", {
        client_name: "ChatGPT",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "client_secret_post",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      client_name: "ChatGPT",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    expect(body.client_id).toMatch(/^cli_/);
    expect(typeof body.client_id_issued_at).toBe("number");
    expect(body).not.toHaveProperty("client_secret");
  });

  it.each([
    ["no addresses", { client_name: "x" }, "invalid_redirect_uri"],
    [
      "an address that is not https",
      { redirect_uris: ["http://evil.example/cb"] },
      "invalid_redirect_uri",
    ],
    [
      "a grant type it cannot use",
      { redirect_uris: [REDIRECT], grant_types: ["client_credentials"] },
      "invalid_client_metadata",
    ],
    ["a body that is not an object", ["nope"], "invalid_client_metadata"],
  ])("refuses %s", async (_, body, error) => {
    const response = await register(json("/oauth/register", body));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error });
  });

  it("answers a browser's preflight", () => {
    const response = registerPreflight();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("the authorization request", () => {
  it("stops, and sends nobody anywhere, for an app it does not know", async () => {
    const verdict = await judgeAuthorizationRequest(
      new URLSearchParams({ client_id: "cli_nobody", redirect_uri: REDIRECT }),
      ORIGIN
    );
    expect(verdict.kind).toBe("stop");
  });

  it("stops for an address the app did not register", async () => {
    const clientId = await registered();
    const verdict = await judgeAuthorizationRequest(
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: "https://evil.example/cb",
        response_type: "code",
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
      }),
      ORIGIN
    );
    expect(verdict.kind).toBe("stop");
  });

  it.each([
    ["no PKCE", { code_challenge: "" }, "invalid_request"],
    ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request"],
    ["another response type", { response_type: "token" }, "unsupported_response_type"],
    ["another resource", { resource: "https://elsewhere.example/mcp" }, "invalid_target"],
  ])("sends the app back an error for %s", async (_, change, error) => {
    const clientId = await registered();
    const asked = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: pkce().challenge,
      code_challenge_method: "S256",
      state: "xyz",
      ...change,
    });
    for (const [name, value] of [...asked]) if (value === "") asked.delete(name);

    const verdict = await judgeAuthorizationRequest(asked, ORIGIN);
    if (verdict.kind !== "send-back") throw new Error(`expected send-back, got ${verdict.kind}`);
    const to = new URL(verdict.to);
    expect(`${to.origin}${to.pathname}`).toBe(REDIRECT);
    expect(to.searchParams.get("error")).toBe(error);
    expect(to.searchParams.get("state")).toBe("xyz");
    expect(to.searchParams.get("iss")).toBe(ORIGIN);
  });
});

describe("the whole way, as ChatGPT walks it", () => {
  it("registers, is allowed, redeems, reaches /mcp, refreshes and is revoked", async () => {
    const clientId = await registered();
    const { verifier, challenge } = pkce();
    const code = await allow(clientId, challenge);

    const redeemed = await token(
      form("/oauth/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
        resource: `${ORIGIN}/mcp`,
      })
    );
    expect(redeemed.status).toBe(200);
    expect(redeemed.headers.get("cache-control")).toBe("no-store");
    const first = (await redeemed.json()) as Record<string, unknown>;
    expect(first).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "kanpai" });

    const answered = await mcp(ping(first.access_token as string));
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });

    // The refresh, as JSON this time: some clients send it so.
    const refreshed = await token(
      json("/oauth/token", {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: clientId,
      })
    );
    expect(refreshed.status).toBe(200);
    const second = (await refreshed.json()) as Record<string, unknown>;
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await mcp(ping(second.access_token as string))).status).toBe(200);

    const stale = await token(
      form("/oauth/token", {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token as string,
        client_id: clientId,
      })
    );
    expect(stale.status).toBe(400);
    expect(await stale.json()).toMatchObject({ error: "invalid_grant" });

    const revoked = await revoke(form("/oauth/revoke", { token: second.refresh_token as string }));
    expect(revoked.status).toBe(200);
    expect((await mcp(ping(second.access_token as string))).status).toBe(401);
    expect((await mcp(ping(first.access_token as string))).status).toBe(401);
  });

  it("refuses a code with the wrong verifier, and then refuses it with the right one", async () => {
    const clientId = await registered();
    const { verifier, challenge } = pkce();
    const code = await allow(clientId, challenge);
    const redeem = (codeVerifier: string) =>
      token(
        form("/oauth/token", {
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: clientId,
          code_verifier: codeVerifier,
        })
      );

    const wrong = await redeem(pkce().verifier);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: "invalid_grant" });
    expect((await redeem(verifier)).status).toBe(400);
  });

  it("refuses an app that never registered, and a grant type it does not know", async () => {
    const unknown = await token(
      form("/oauth/token", {
        grant_type: "authorization_code",
        code: "x",
        redirect_uri: REDIRECT,
        client_id: "cli_nobody",
        code_verifier: pkce().verifier,
      })
    );
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toMatchObject({ error: "invalid_client" });

    const other = await token(form("/oauth/token", { grant_type: "password", client_id: "x" }));
    expect(await other.json()).toMatchObject({ error: "unsupported_grant_type" });

    const nothing = await token(form("/oauth/token", {}));
    expect(await nothing.json()).toMatchObject({ error: "invalid_request" });
  });

  it("refuses a code redeemed for somebody else's resource", async () => {
    const clientId = await registered();
    const { verifier, challenge } = pkce();
    const code = await allow(clientId, challenge);
    const response = await token(
      form("/oauth/token", {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT,
        client_id: clientId,
        code_verifier: verifier,
        resource: "https://elsewhere.example/mcp",
      })
    );
    expect(await response.json()).toMatchObject({ error: "invalid_target" });
  });

  it("answers a revocation of anything with 200", async () => {
    expect((await revoke(form("/oauth/revoke", { token: "nothing" }))).status).toBe(200);
    expect((await revoke(form("/oauth/revoke", {}))).status).toBe(200);
  });
});
