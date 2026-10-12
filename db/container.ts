import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Connection, connection } from "./env.ts";

const run = promisify(execFile);

// The local Postgres.
//
// Production is whatever Postgres the copy is run against — the owner's cluster, or the
// `postgres` service in `compose.yaml` (ADR-0008); locally it is one throwaway container,
// so that everything up to the first usable version needs no cloud account, no secret and
// no cluster.
//
// The image is the major `compose.yaml` runs and the one tsundoku runs (ADR-0001), because
// a local major that differs from the deployed one is a difference you find out about at
// migration time.
const IMAGE = "postgres:18-alpine";

/** The port whose container name carries no suffix. */
const DEFAULT_PORT = 5432;

/** A short description of an error, for a message meant to be read. */
function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The container's name: `kanpai-pg` on the default port, `kanpai-pg-<port>`
 * anywhere else.
 *
 * Deriving it from the port is what keeps `DATABASE_URL` the *only* variable. Several
 * checkouts work on this repo at once; with a fixed name, a second one moving to
 * another port would find the first one's container already running, skip creating its
 * own, and then fail to connect — a confusing way to learn it needed a second variable
 * it was never told about.
 */
export function containerName(port: number): string {
  return port === DEFAULT_PORT ? "kanpai-pg" : `kanpai-pg-${port}`;
}

type State = "absent" | "running" | "stopped";

async function state(name: string): Promise<State> {
  try {
    const { stdout } = await run("docker", ["inspect", "-f", "{{.State.Running}}", name]);
    return stdout.trim() === "true" ? "running" : "stopped";
  } catch {
    return "absent";
  }
}

async function requireDocker(): Promise<void> {
  try {
    await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  } catch {
    throw new Error(
      "Docker is not answering. Start Docker Desktop (or your daemon) and try again."
    );
  }
}

/**
 * Bring the container up and wait until Postgres accepts connections. Idempotent: an
 * existing container is started rather than replaced, so `pnpm db:up` on a database
 * you already have keeps its rows.
 */
export async function ensureContainer(url: string): Promise<void> {
  await requireDocker();
  const where = connection(url);
  const name = containerName(where.port);

  switch (await state(name)) {
    case "running":
      break;
    case "stopped":
      process.stdout.write(`starting container ${name}\n`);
      await start(name, where);
      break;
    case "absent":
      process.stdout.write(`creating container ${name} (${IMAGE}) on port ${where.port}\n`);
      await create(name, where);
      break;
  }

  await waitUntilReady(name, where);
}

async function start(name: string, where: Connection): Promise<void> {
  try {
    await run("docker", ["start", name]);
  } catch (cause) {
    throw portConflict(cause, where) ?? cause;
  }
}

async function create(name: string, where: Connection): Promise<void> {
  try {
    await run("docker", [
      "run",
      "--detach",
      "--name",
      name,
      // Bound to loopback, never 0.0.0.0: this database holds the owner's Tastings and
      // has no business being reachable from the network it is on.
      "--publish",
      `127.0.0.1:${where.port}:5432`,
      "--env",
      `POSTGRES_USER=${where.user}`,
      "--env",
      `POSTGRES_PASSWORD=${where.password}`,
      "--env",
      `POSTGRES_DB=${where.database}`,
      IMAGE,
    ]);
  } catch (cause) {
    // A `docker run` that fails on the port binding still leaves the container behind,
    // stopped. Clear it, so the next attempt creates one on the port the developer has
    // just corrected rather than starting this one again.
    await run("docker", ["rm", "--force", "--volumes", name]).catch(() => {});
    throw portConflict(cause, where) ?? cause;
  }
}

/**
 * Turn docker's port-binding failure into the one instruction that fixes it. The port
 * is the only thing about the local loop that is genuinely per-machine.
 *
 * Deliberately carries no `cause`: docker's own message is a screen of image-pull
 * progress with the useful line somewhere in the middle of it.
 */
function portConflict(cause: unknown, where: Connection): Error | undefined {
  const message = messageOf(cause);
  if (!/port is already allocated|address already in use|ports are not available/i.test(message)) {
    return undefined;
  }
  return new Error(
    `Port ${where.port} is already taken — something else is listening there ` +
      "(a Postgres installed on the host, most often).\n" +
      "Point this checkout somewhere else by setting one variable, in .env.local or in " +
      "the shell:\n" +
      `  DATABASE_URL=postgres://${where.user}:${where.password}` +
      `@127.0.0.1:${where.port + 1}/${where.database}\n` +
      "Then `pnpm db:up` again. That is the whole change."
  );
}

/**
 * Wait until Postgres accepts a connection **over TCP**, which is not the same question as
 * whether it is running.
 *
 * The official image's entrypoint starts a server of its own first, on the unix socket
 * only, to run initdb and the `POSTGRES_*` setup against — and then shuts it down and
 * starts the real one. A `pg_isready` with no host asks the socket, so it answers *ready*
 * during that window, and what comes next is a connection from the host that is accepted
 * and then dropped mid-handshake: `Connection terminated unexpectedly`, on a container that
 * is healthy by the time you go and look at it.
 *
 * `-h 127.0.0.1` is the whole fix: it asks over TCP, which the temporary server is not
 * listening on. Rare on a laptop, where the image is already pulled and the first thing
 * after this is a human; every time on a cold CI runner, which is where it was found.
 */
async function waitUntilReady(name: string, where: Connection): Promise<void> {
  const deadline = Date.now() + 60_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      await run("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", where.user, "-q"]);
      return;
    } catch (cause) {
      last = messageOf(cause);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Postgres in ${name} did not become ready within 60s.\n${last}`);
}

/** Stop and delete the container, and the data in it with it. */
export async function removeContainer(url: string): Promise<void> {
  await requireDocker();
  const name = containerName(connection(url).port);
  if ((await state(name)) === "absent") {
    process.stdout.write(`container ${name} is not there\n`);
    return;
  }
  await run("docker", ["rm", "--force", "--volumes", name]);
  process.stdout.write(`removed container ${name}\n`);
}

/** `psql` inside the container, so nothing has to be installed on the host. */
export function psqlArgs(url: string): string[] {
  const where = connection(url);
  return ["exec", "-it", containerName(where.port), "psql", "-U", where.user, "-d", where.database];
}
