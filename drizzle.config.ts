import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // Names the ledger table what the old runner called it, so "which migrations has this
  // database had?" is still one query against one name.
  migrations: { table: "schema_migrations" },
  casing: "snake_case",
});
