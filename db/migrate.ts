import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { connection, withDatabase } from "./env.ts";

// The schema, applied.
//
// Migrations are ordered, forward-only SQL files in `db/migrations`, and **Drizzle owns
// the ledger** — tsundoku's ADR-0009, taken over with the rest of its stack (ADR-0001). It
// records each file by a hash of its contents in its own `drizzle.__drizzle_migrations`
// table and refuses one that has changed since.
//
// What Drizzle also gives, and is why it is here: `drizzle-kit generate` writes the next
// file by diffing `db/schema.ts` against the last snapshot, and numbers it sequentially, so
// nobody picks a number and two slices never race for one.
//
// **What Drizzle does not express, and this repository uses.** Generated migrations carry
// no `comment on`, no functions and no rows, so three things are hand-written SQL for ever:
//
//   - `gen_prefixed_id()`, which every table's id defaults to;
//   - every `comment on`, which is where this schema documents itself;
//   - the vocabularies, which are rows and not schema — the Kinds first (ADR-0002).
//
// A migration that touches those is written by hand into the generated file, after
// `drizzle-kit generate` has produced the rest — or, for rows alone, into an empty one that
// `drizzle-kit generate --custom` made so the journal still owns the order.
//
// One rule survives unchanged: a file already applied is never edited. Drizzle's hash
// refuses it, and `pnpm db:reset` is the answer while a change is still yours alone.

const MIGRATIONS = fileURLToPath(new URL("./migrations/", import.meta.url));

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Create the database named in the URL if the server does not have it yet. */
export async function ensureDatabase(url: string): Promise<void> {
  const { database } = connection(url);
  const admin = await connect(withDatabase(url, "postgres"));
  try {
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [
      database,
    ]);
    if (rowCount === 0) {
      // `create database` takes no parameters, and the name comes from a URL the
      // developer wrote, so it is quoted as an identifier rather than interpolated.
      await admin.query(`create database ${quoteIdentifier(database)}`);
      process.stdout.write(`created database ${database}\n`);
    }
  } finally {
    await admin.end();
  }
}

/** Delete the database named in the URL, so the next apply starts from nothing. */
export async function dropDatabase(url: string): Promise<void> {
  const { database } = connection(url);
  const admin = await connect(withDatabase(url, "postgres"));
  try {
    await admin.query(`drop database if exists ${quoteIdentifier(database)} with (force)`);
    process.stdout.write(`dropped database ${database}\n`);
  } finally {
    await admin.end();
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Apply every migration the database has not seen. Safe to run on a database that is
 * already current, which is what the deployment's init container relies on: it runs this
 * before the app is allowed to serve, on every rollout.
 */
export async function applyMigrations(url: string): Promise<void> {
  const client = await connect(url);
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  } finally {
    await client.end();
  }
}
