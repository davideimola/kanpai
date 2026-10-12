import { execFileSync } from "node:child_process";
import { ensureContainer, psqlArgs, removeContainer } from "./container.ts";
import { requireDatabaseUrl } from "./env.ts";
import { applyMigrations, dropDatabase, ensureDatabase } from "./migrate.ts";

// The local loop, as four commands, and one more that is not part of it: `migrate` is
// what the deployment's init container runs, and it is the only one here that does not
// reach for Docker. See the README.

const USAGE = `usage: node db/cli.ts <up|reset|down|psql|migrate>

  up       bring the container up and apply every pending migration
  reset    drop the database and apply the whole schema from scratch
  down     delete the container, and its data with it
  psql     a psql shell inside the container
  migrate  apply every pending migration to the database DATABASE_URL names
`;

async function main(): Promise<void> {
  const command = process.argv[2];
  const url = requireDatabaseUrl();

  switch (command) {
    case "down":
      await removeContainer(url);
      return;
    case "up": {
      await ensureContainer(url);
      await ensureDatabase(url);
      // Drizzle's migrator prints what it applies and returns nothing, so there is no
      // count to report here. Silence means the schema was already current.
      await applyMigrations(url);
      process.stdout.write("schema is current\n");
      return;
    }
    case "reset": {
      await ensureContainer(url);
      await dropDatabase(url);
      await ensureDatabase(url);
      await applyMigrations(url);
      process.stdout.write("schema rebuilt from the migrations\n");
      return;
    }
    // The one command that assumes nothing about where the database is. The other four
    // reach for Docker, because locally the container *is* the server; deployed, the
    // server already exists and already holds the database and the role — the cluster's,
    // or compose's `postgres` service (ADR-0008) — and there is no Docker to reach for. So this
    // applies migrations and does nothing else — it is what the deployment's init
    // container runs, in the same image that then serves, so what is applied is exactly
    // what was built.
    case "migrate": {
      await applyMigrations(url);
      process.stdout.write("schema is current\n");
      return;
    }
    case "psql": {
      await ensureContainer(url);
      execFileSync("docker", psqlArgs(url), { stdio: "inherit" });
      return;
    }
    default:
      process.stderr.write(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause) process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
