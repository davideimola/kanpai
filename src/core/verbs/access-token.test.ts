import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { listAccessTokens } from "../queries/access-token.ts";
import { authenticateAccessToken, issueAccessToken, revokeAccessToken } from "./access-token.ts";

// Seam 1, against the real Postgres. The tokens the MCP door takes (ADR-0009): issued under a
// name and shown once, kept as a hash, revoked one by one, and nothing let in when none is live.
beforeEach(async () => {
  await query("truncate access_tokens");
});

describe("issuing a token", () => {
  it("returns a secret once, and keeps only its hash", async () => {
    const issued = await issueAccessToken(" Claude ");

    expect(issued.id).toMatch(/^tok_[0-9a-f]{24}$/);
    expect(issued.name).toBe("Claude");
    expect(issued.secret).toMatch(/^kanpai_[A-Za-z0-9_-]{43}$/);

    const [row] = await query<{ secret_hash: string }>("select secret_hash from access_tokens");
    expect(row?.secret_hash).toBe(createHash("sha256").update(issued.secret).digest("hex"));
    expect(JSON.stringify(await query("select * from access_tokens"))).not.toContain(issued.secret);
  });

  it("never issues the same secret twice", async () => {
    const one = await issueAccessToken("Claude");
    const two = await issueAccessToken("laptop");
    expect(one.secret).not.toBe(two.secret);
  });

  it("refuses a blank name", async () => {
    await expect(issueAccessToken("  ")).rejects.toMatchObject({
      code: "invalid",
      constraint: "access_tokens_name_is_not_blank",
    });
  });

  it("refuses a name a live token has, and frees it when that one is revoked", async () => {
    const first = await issueAccessToken("Claude");
    await expect(issueAccessToken("Claude")).rejects.toMatchObject({
      code: "already-exists",
      message: expect.stringContaining("already has that name"),
    });

    await revokeAccessToken(first.id);
    await expect(issueAccessToken("Claude")).resolves.toMatchObject({ name: "Claude" });
  });
});

describe("listing the tokens", () => {
  it("shows names and history, live first, and never a secret or a hash", async () => {
    const old = await issueAccessToken("tunnel");
    await issueAccessToken("Claude");
    await revokeAccessToken(old.id);

    const listed = await listAccessTokens();
    expect(listed.map((token) => [token.name, token.revokedAt === null])).toEqual([
      ["Claude", true],
      ["tunnel", false],
    ]);
    expect(Object.keys(listed[0] ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "lastUsedAt",
      "name",
      "revokedAt",
    ]);
  });
});

describe("authenticating a secret", () => {
  it("lets a live token in, says whose it is, and touches when it was used", async () => {
    const issued = await issueAccessToken("Claude");

    expect(await authenticateAccessToken(issued.secret)).toEqual({
      ok: true,
      caller: { tokenId: issued.id, name: "Claude" },
    });
    const [token] = await listAccessTokens();
    expect(token?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("touches the last-used time at most once a minute", async () => {
    const issued = await issueAccessToken("Claude");
    await query("update access_tokens set last_used_at = now() - interval '30 seconds'");
    const [before] = await listAccessTokens();

    await authenticateAccessToken(issued.secret);
    const [after] = await listAccessTokens();
    expect(after?.lastUsedAt).toEqual(before?.lastUsedAt);

    await query("update access_tokens set last_used_at = now() - interval '2 minutes'");
    await authenticateAccessToken(issued.secret);
    const [later] = await listAccessTokens();
    expect(later?.lastUsedAt?.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("refuses everything while no token is live", async () => {
    expect(await authenticateAccessToken("kanpai_anything")).toEqual({
      ok: false,
      refusal: "none-issued",
    });

    const issued = await issueAccessToken("Claude");
    await revokeAccessToken(issued.id);
    expect(await authenticateAccessToken("kanpai_anything")).toEqual({
      ok: false,
      refusal: "none-issued",
    });
  });

  it("refuses a secret no token has", async () => {
    const issued = await issueAccessToken("Claude");
    expect(await authenticateAccessToken(`${issued.secret}x`)).toEqual({
      ok: false,
      refusal: "unknown",
    });
    expect(await authenticateAccessToken(issued.secret.slice(0, -1))).toMatchObject({ ok: false });
  });

  it("refuses a revoked token, and does not touch it", async () => {
    const issued = await issueAccessToken("Claude");
    await revokeAccessToken(issued.id);

    expect(await authenticateAccessToken(issued.secret)).toEqual({
      ok: false,
      refusal: "revoked",
    });
    const [token] = await listAccessTokens();
    expect(token?.lastUsedAt).toBeNull();
  });
});

describe("revoking a token", () => {
  it("refuses a token that is not there", async () => {
    await expect(revokeAccessToken("tok_nothing")).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses revoking one twice", async () => {
    const issued = await issueAccessToken("Claude");
    await revokeAccessToken(issued.id);
    await expect(revokeAccessToken(issued.id)).rejects.toMatchObject({ code: "not-allowed" });
  });
});

describe("the database, whoever writes to access_tokens", () => {
  it("keeps a revocation final", async () => {
    const issued = await issueAccessToken("Claude");
    await revokeAccessToken(issued.id);
    await expect(
      query("update access_tokens set revoked_at = null where id = $1", [issued.id])
    ).rejects.toMatchObject({ code: "23001", constraint: "access_tokens_revoked_is_final" });
  });

  it("keeps the secret a token was issued with", async () => {
    const issued = await issueAccessToken("Claude");
    await expect(
      query("update access_tokens set secret_hash = repeat('0', 64) where id = $1", [issued.id])
    ).rejects.toMatchObject({ code: "23001", constraint: "access_tokens_secret_is_final" });
  });

  it("refuses a hash that is not a SHA-256", async () => {
    await expect(
      query("insert into access_tokens (name, secret_hash) values ('Claude', 'kanpai_plain')")
    ).rejects.toMatchObject({ constraint: "access_tokens_secret_hash_is_a_sha256" });
  });
});
