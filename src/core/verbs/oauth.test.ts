import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listAccessTokens } from "../queries/access-token.ts";
import { listConnectedApps } from "../queries/oauth.ts";
import { authenticateAccessToken, issueAccessToken } from "./access-token.ts";
import {
  type Granted,
  issueAuthorizationCode,
  pkceHolds,
  redeemAuthorizationCode,
  refreshGrant,
  registerOAuthClient,
  revokeBySecret,
  revokeGrant,
  UNNAMED_CLIENT,
} from "./oauth.ts";

// Seam 1, against the real Postgres. kanpai as its own OAuth authorization server (ADR-0013):
// an app registers, the owner's yes becomes a code, the code a grant, the grant a string of
// hour-long access tokens — rows in the same table as the owner's own tokens, let in by the
// same check.

beforeEach(async () => {
  await query("truncate access_tokens, oauth_codes, oauth_grants, oauth_clients");
});

const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";

/** A PKCE pair, as an app makes one: a random verifier and its S256 challenge. */
function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** An app registered, the owner's yes to it, and the code that yes produced. */
async function allowed(name = "ChatGPT") {
  const client = await registerOAuthClient({ name, redirectUris: [REDIRECT] });
  const { verifier, challenge } = pkce();
  const code = await issueAuthorizationCode({
    clientId: client.clientId,
    redirectUri: REDIRECT,
    codeChallenge: challenge,
  });
  return { client, verifier, challenge, code };
}

/** The whole way to a grant, for the tests that start after it. */
async function granted(name = "ChatGPT"): Promise<Granted & { clientId: string }> {
  const { client, verifier, code } = await allowed(name);
  const verdict = await redeemAuthorizationCode({
    code,
    clientId: client.clientId,
    redirectUri: REDIRECT,
    codeVerifier: verifier,
  });
  if (!verdict.ok) throw new Error(`expected a grant, got ${verdict.refusal}`);
  return { ...verdict.granted, clientId: client.clientId };
}

describe("registering an app", () => {
  it("keeps its name and its addresses, and gives it a client id", async () => {
    const client = await registerOAuthClient({
      name: "  ChatGPT  ",
      redirectUris: [REDIRECT, "http://localhost:6274/oauth/callback"],
    });

    expect(client.clientId).toMatch(/^cli_[0-9a-f]{24}$/);
    expect(client.name).toBe("ChatGPT");
    expect(client.redirectUris).toEqual([REDIRECT, "http://localhost:6274/oauth/callback"]);
  });

  it("names an app that said nothing, and cuts a long name to fit", async () => {
    expect((await registerOAuthClient({ redirectUris: [REDIRECT] })).name).toBe(UNNAMED_CLIENT);
    expect((await registerOAuthClient({ name: " \n ", redirectUris: [REDIRECT] })).name).toBe(
      UNNAMED_CLIENT
    );
    const long = await registerOAuthClient({ name: "a".repeat(500), redirectUris: [REDIRECT] });
    expect(long.name).toHaveLength(100);
  });

  it.each([
    ["no address", []],
    ["plain http to another host", ["http://chatgpt.com/callback"]],
    ["another scheme", ["myapp://callback"]],
    ["not an address", ["callback"]],
    ["a fragment", ["https://chatgpt.com/callback#here"]],
  ])("refuses %s", async (_, redirectUris) => {
    await expect(registerOAuthClient({ redirectUris })).rejects.toMatchObject({ code: "invalid" });
  });

  it("takes http to this machine", async () => {
    for (const uri of ["http://localhost:3000/cb", "http://127.0.0.1:9/cb", "http://[::1]/cb"]) {
      await expect(registerOAuthClient({ redirectUris: [uri] })).resolves.toMatchObject({
        redirectUris: [uri],
      });
    }
  });
});

describe("a code", () => {
  it("is refused for an address the app did not register", async () => {
    const client = await registerOAuthClient({ redirectUris: [REDIRECT] });
    await expect(
      issueAuthorizationCode({
        clientId: client.clientId,
        redirectUri: "https://evil.example/cb",
        codeChallenge: pkce().challenge,
      })
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("is kept only as a hash", async () => {
    const { code } = await allowed();
    expect(JSON.stringify(await query("select * from oauth_codes"))).not.toContain(code);
  });

  it("becomes a grant with the right verifier, and the grant is a connected app", async () => {
    const grant = await granted("ChatGPT");

    expect(grant.accessToken).toMatch(/^kanpai_at_[A-Za-z0-9_-]{43}$/);
    expect(grant.refreshToken).toMatch(/^kanpai_rt_[A-Za-z0-9_-]{43}$/);
    expect(grant.expiresInSeconds).toBe(3600);
    expect(await authenticateAccessToken(grant.accessToken)).toMatchObject({
      ok: true,
      caller: { name: "ChatGPT" },
    });

    const apps = await listConnectedApps();
    expect(apps.map((app) => app.name)).toEqual(["ChatGPT"]);
    expect(apps[0]?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("is refused with a verifier that is not the one", async () => {
    const { client, code } = await allowed();
    expect(
      await redeemAuthorizationCode({
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: pkce().verifier,
      })
    ).toEqual({ ok: false, refusal: "pkce-failed" });
  });

  it("is refused at another address than the one it was sent to", async () => {
    const { client, verifier, code } = await allowed();
    expect(
      await redeemAuthorizationCode({
        code,
        clientId: client.clientId,
        redirectUri: `${REDIRECT}/other`,
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, refusal: "wrong-redirect" });
  });

  it("is refused for another app", async () => {
    const { verifier, code } = await allowed();
    const other = await registerOAuthClient({ redirectUris: [REDIRECT] });
    expect(
      await redeemAuthorizationCode({
        code,
        clientId: other.clientId,
        redirectUri: REDIRECT,
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, refusal: "wrong-client" });
  });

  it("is refused once its five minutes are up", async () => {
    const { client, verifier, code } = await allowed();
    await query("update oauth_codes set expires_at = now() - interval '1 second'");
    expect(
      await redeemAuthorizationCode({
        code,
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, refusal: "code-expired" });
  });

  it("is burnt by a wrong guess, so the right verifier after it is refused too", async () => {
    const { client, verifier, code } = await allowed();
    const asked = { code, clientId: client.clientId, redirectUri: REDIRECT };
    await redeemAuthorizationCode({ ...asked, codeVerifier: pkce().verifier });
    expect(await redeemAuthorizationCode({ ...asked, codeVerifier: verifier })).toEqual({
      ok: false,
      refusal: "code-reused",
    });
  });

  it("used twice, is refused and takes down the grant the first use produced", async () => {
    const { client, verifier, code } = await allowed();
    const asked = {
      code,
      clientId: client.clientId,
      redirectUri: REDIRECT,
      codeVerifier: verifier,
    };
    const first = await redeemAuthorizationCode(asked);
    if (!first.ok) throw new Error("the first use should be granted");

    expect(await redeemAuthorizationCode(asked)).toEqual({ ok: false, refusal: "code-reused" });
    expect(await authenticateAccessToken(first.granted.accessToken)).toEqual({
      ok: false,
      refusal: "revoked",
    });
    expect(await listConnectedApps()).toEqual([]);
  });

  it("is refused when nobody issued it", async () => {
    const { client, verifier } = await allowed();
    expect(
      await redeemAuthorizationCode({
        code: "not-a-code",
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeVerifier: verifier,
      })
    ).toEqual({ ok: false, refusal: "unknown-code" });
  });
});

describe("PKCE", () => {
  it("holds for the verifier of a challenge and for nothing else", () => {
    const { verifier, challenge } = pkce();
    expect(pkceHolds(verifier, challenge)).toBe(true);
    expect(pkceHolds(`${verifier}x`, challenge)).toBe(false);
    expect(pkceHolds("short", challenge)).toBe(false);
    expect(pkceHolds(verifier, `${challenge}x`)).toBe(false);
  });

  // RFC 7636 Appendix B: the worked example, so the encoding is the RFC's and not ours.
  it("agrees with the RFC's own example", () => {
    expect(
      pkceHolds(
        "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
      )
    ).toBe(true);
  });
});

describe("an OAuth access token at the door", () => {
  it("is refused once its hour is up", async () => {
    const grant = await granted();
    await query("update access_tokens set expires_at = now() - interval '1 second'");
    expect(await authenticateAccessToken(grant.accessToken)).toEqual({
      ok: false,
      refusal: "expired",
    });
  });

  it("is refused when its grant is revoked, whatever its own row says", async () => {
    const grant = await granted();
    await query("update oauth_grants set revoked_at = now()");
    expect(await authenticateAccessToken(grant.accessToken)).toEqual({
      ok: false,
      refusal: "revoked",
    });
  });
});

describe("refreshing a grant", () => {
  it("rotates the refresh token, and the one before it is refused", async () => {
    const grant = await granted();
    const next = await refreshGrant({ refreshToken: grant.refreshToken, clientId: grant.clientId });
    if (!next.ok) throw new Error(`expected a refresh, got ${next.refusal}`);

    expect(next.granted.grantId).toBe(grant.grantId);
    expect(next.granted.refreshToken).not.toBe(grant.refreshToken);
    expect(next.granted.accessToken).not.toBe(grant.accessToken);
    expect(await authenticateAccessToken(next.granted.accessToken)).toMatchObject({ ok: true });

    expect(
      await refreshGrant({ refreshToken: grant.refreshToken, clientId: grant.clientId })
    ).toEqual({ ok: false, refusal: "unknown-refresh" });
  });

  it("is refused for another app", async () => {
    const grant = await granted();
    const other = await registerOAuthClient({ redirectUris: [REDIRECT] });
    expect(
      await refreshGrant({ refreshToken: grant.refreshToken, clientId: other.clientId })
    ).toEqual({ ok: false, refusal: "wrong-client" });
  });

  it("sweeps the grant's access tokens already expired, and keeps the live one", async () => {
    const grant = await granted();
    const second = await refreshGrant({
      refreshToken: grant.refreshToken,
      clientId: grant.clientId,
    });
    if (!second.ok) throw new Error("expected a refresh");
    await query(
      `update access_tokens set expires_at = now() - interval '1 second'
        where secret_hash = $1`,
      [createHash("sha256").update(grant.accessToken).digest("hex")]
    );

    const third = await refreshGrant({
      refreshToken: second.granted.refreshToken,
      clientId: grant.clientId,
    });
    if (!third.ok) throw new Error("expected a refresh");

    expect(await authenticateAccessToken(grant.accessToken)).toEqual({
      ok: false,
      refusal: "unknown",
    });
    expect(await authenticateAccessToken(second.granted.accessToken)).toMatchObject({ ok: true });
    expect(await query("select 1 from access_tokens")).toHaveLength(2);
  });
});

describe("revoking a grant", () => {
  it("from the settings, refuses every access token under it and its refresh token", async () => {
    const grant = await granted("ChatGPT");
    const later = await refreshGrant({
      refreshToken: grant.refreshToken,
      clientId: grant.clientId,
    });
    if (!later.ok) throw new Error("expected a refresh");

    expect(await revokeGrant(grant.grantId)).toEqual({ name: "ChatGPT" });

    for (const token of [grant.accessToken, later.granted.accessToken]) {
      expect(await authenticateAccessToken(token)).toEqual({ ok: false, refusal: "revoked" });
    }
    expect(
      await refreshGrant({ refreshToken: later.granted.refreshToken, clientId: grant.clientId })
    ).toEqual({ ok: false, refusal: "grant-revoked" });
    expect(await listConnectedApps()).toEqual([]);
  });

  it("is refused twice, and for a grant that is not there", async () => {
    const grant = await granted();
    await revokeGrant(grant.grantId);
    await expect(revokeGrant(grant.grantId)).rejects.toMatchObject({ code: "not-allowed" });
    await expect(revokeGrant("grant_nothing")).rejects.toMatchObject({ code: "not-found" });
  });

  it("by the app, with its refresh token or an access token", async () => {
    const one = await granted("ChatGPT");
    const two = await granted("Claude");

    await revokeBySecret(one.refreshToken);
    await revokeBySecret(two.accessToken);
    await revokeBySecret("kanpai_nothing");

    expect(await listConnectedApps()).toEqual([]);
    expect(await authenticateAccessToken(one.accessToken)).toMatchObject({ ok: false });
  });

  it("never touches a token the owner issued by name", async () => {
    const owner = await issueAccessToken("Claude");
    await revokeBySecret(owner.secret);
    expect(await authenticateAccessToken(owner.secret)).toMatchObject({ ok: true });
  });

  it("is final in the database too", async () => {
    const grant = await granted();
    await revokeGrant(grant.grantId);
    await expect(query("update oauth_grants set revoked_at = null")).rejects.toMatchObject({
      code: "23001",
      constraint: "oauth_grants_revoked_is_final",
    });
    await expect(
      query("update oauth_grants set refresh_hash = repeat('0', 64)")
    ).rejects.toMatchObject({ constraint: "oauth_grants_revoked_is_final" });
  });
});

describe("the owner's own tokens, beside OAuth's", () => {
  it("keep their names unique among themselves, and OAuth's do not count", async () => {
    await granted("Claude");
    await granted("Claude");
    await expect(issueAccessToken("Claude")).resolves.toMatchObject({ name: "Claude" });
    await expect(issueAccessToken("Claude")).rejects.toMatchObject({ code: "already-exists" });
  });

  it("are the only ones listed as access tokens", async () => {
    await granted("ChatGPT");
    await issueAccessToken("laptop");
    expect((await listAccessTokens()).map((token) => token.name)).toEqual(["laptop"]);
  });

  it("never carry a grant or an expiry, and OAuth's always carry both", async () => {
    await expect(
      query(
        "insert into access_tokens (name, secret_hash, expires_at) values ('x', repeat('a', 64), now())"
      )
    ).rejects.toMatchObject({ constraint: "access_tokens_grant_and_expiry_go_together" });
  });
});
