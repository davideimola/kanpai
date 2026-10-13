import "server-only";

import { query } from "../db.ts";

/**
 * An access token as the owner sees it on `/settings` and from `pnpm token list`: its name
 * and its history, and never its secret or its hash (ADR-0009).
 */
export type AccessToken = {
  id: string;
  name: string;
  createdAt: Date;
  /** When the door last let it in, to the minute; `null` if it never has. */
  lastUsedAt: Date | null;
  /** When it was revoked; `null` while it is live. */
  revokedAt: Date | null;
};

/**
 * Every token the owner ever issued: the live ones first, then the revoked, each oldest first.
 *
 * Only the owner's. The OAuth access tokens in the same table are an app's, an hour long and
 * one more every hour; the owner sees the grant they come from instead, as a connected app
 * (`./oauth.ts`, ADR-0013).
 */
export async function listAccessTokens(): Promise<AccessToken[]> {
  return query<AccessToken>(
    `select id, name, created_at as "createdAt", last_used_at as "lastUsedAt",
            revoked_at as "revokedAt"
       from access_tokens
      where grant_id is null
      order by revoked_at is not null, created_at, id`
  );
}
