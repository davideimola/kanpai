import "server-only";

import { query } from "../db.ts";

// What the OAuth side of the MCP door reads (ADR-0013): an app that registered itself, and the
// apps the owner said yes to. The writing is `../verbs/oauth.ts`.

/** An app as it registered: its `client_id`, its name, where a code may be sent back. */
export type OAuthClient = {
  id: string;
  name: string;
  redirectUris: string[];
};

/** The app with this `client_id`, or `null` — an unknown one is the caller's to refuse. */
export async function findOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const [found] = await query<OAuthClient>(
    `select id, name, redirect_uris as "redirectUris" from oauth_clients where id = $1`,
    [clientId]
  );
  return found ?? null;
}

/**
 * A **connected app** as the owner sees it on `/settings`: a grant they allowed, named after
 * the app, with when it connected and when it last reached the door. Never a token or a hash.
 */
export type ConnectedApp = {
  id: string;
  name: string;
  connectedAt: Date;
  /** When one of its access tokens last reached the door, to the minute; `null` if never. */
  lastUsedAt: Date | null;
};

/**
 * The apps that can reach kanpai right now, oldest connection first.
 *
 * Only the live ones. A revoked grant is history nobody acts on — unlike a revoked token the
 * owner named, which is listed so the name it freed is explained — and an app that is
 * disconnected and connected again would otherwise be listed once for every time.
 */
export async function listConnectedApps(): Promise<ConnectedApp[]> {
  return query<ConnectedApp>(
    `select id, name, created_at as "connectedAt", last_used_at as "lastUsedAt"
       from oauth_grants
      where revoked_at is null
      order by created_at, id`
  );
}
