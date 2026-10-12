import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Where the one variable comes from.
//
// `DATABASE_URL` is the whole configuration of the local loop: it carries the host,
// the port, the credentials and the database name, so a second checkout moves to
// another port by setting it and nothing else. `next dev` reads `.env.local` on its
// own; the scripts and the test run read it through here so all three agree.
//
// There is deliberately no second variable. One that only some of the three read
// would be a way for them to disagree.

const ENV_FILE = fileURLToPath(new URL("../.env.local", import.meta.url));

let loaded = false;

/** A trimmed value, or undefined if it was absent or blank. */
function set(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * Load `.env.local` if it exists.
 *
 * `process.loadEnvFile` leaves a variable that is already set alone, so a value from
 * the shell wins over the file without any help from here — which is what lets
 * `DATABASE_URL=… pnpm test` point a checkout at its own port.
 */
export function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

/** The development database's URL, or a message saying how to get one. */
export function requireDatabaseUrl(): string {
  loadEnvLocal();
  const url = set(process.env.DATABASE_URL);
  if (url) return url;

  throw new Error(
    "DATABASE_URL is not set.\n" +
      "  cp .env.example .env.local     # the local default, port 5432\n" +
      "Set it to another port if 5432 is taken; nothing else needs changing."
  );
}

/**
 * The database the test run uses: the development database's name with `_test`
 * appended.
 *
 * A separate database rather than a separate container, so that one `DATABASE_URL`
 * still describes the whole local loop, and so that a verb test truncating a table
 * cannot take the Kinds you were just looking at in the browser with it.
 *
 * Idempotent, because the test run puts the result of this back into
 * `process.env.DATABASE_URL` for the core module to read: applying it twice must not
 * reach for `kanpai_test_test`.
 */
export function testDatabaseUrl(developmentUrl: string): string {
  const { database } = connection(developmentUrl);
  if (database.endsWith("_test")) return developmentUrl;
  return withDatabase(developmentUrl, `${database}_test`);
}

/** The test database's URL, resolved from the environment in one step. */
export function resolveTestDatabaseUrl(): string {
  return testDatabaseUrl(requireDatabaseUrl());
}

export type Connection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

/** Pull the parts a `docker run` needs out of the URL. */
export function connection(url: string): Connection {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL is not a URL: ${url}`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`DATABASE_URL must be a postgres:// URL, not ${parsed.protocol}//`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database === "") throw new Error(`DATABASE_URL names no database: ${url}`);

  return {
    host: parsed.hostname || "127.0.0.1",
    port: Number(parsed.port || "5432"),
    user: decodeURIComponent(parsed.username) || "postgres",
    password: decodeURIComponent(parsed.password) || "postgres",
    database,
  };
}

/** The same server, a different database — used for `create`/`drop database`. */
export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}
