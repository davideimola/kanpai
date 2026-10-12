import { ensureContainer } from "../../db/container.ts";
import { requireDatabaseUrl, resolveTestDatabaseUrl } from "../../db/env.ts";
import { applyMigrations, ensureDatabase } from "../../db/migrate.ts";

/**
 * Bring the test database into existence before any test runs, so that `pnpm test` is
 * the whole command on a fresh clone with Docker running and nothing else.
 *
 * Both the container and the test database come from the one variable: the container
 * from `DATABASE_URL`'s port, the database from its name with `_test` appended.
 */
export default async function setup(): Promise<void> {
  const development = requireDatabaseUrl();
  const test = resolveTestDatabaseUrl();

  await ensureContainer(development);
  await ensureDatabase(test);
  await applyMigrations(test);
}
