import { createServer, type Server, type Socket } from "node:net";

import { closePool } from "@/core/db";

// Two ways for the database to be gone, both real rather than a mock of the pool: a port
// nothing listens on, which refuses the connection at once, and a server that accepts it and
// never says a word, which is what a Postgres stuck behind a dead network looks like from
// here. `src/core/health.test.ts` and `src/app/healthz/route.test.ts` point the pool at them.

/** A database URL on a port that was free a moment ago, so connecting to it is refused. */
export async function aRefusingDatabase(): Promise<string> {
  const server = await listening();
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return `postgres://kanpai:kanpai@127.0.0.1:${port}/kanpai`;
}

/** A database URL that accepts the connection and never answers, and how to hang it up. */
export async function aSilentDatabase(): Promise<{ url: string; hangUp: () => Promise<void> }> {
  const sockets = new Set<Socket>();
  const server = await listening((socket) => sockets.add(socket));
  const { port } = server.address() as { port: number };

  return {
    url: `postgres://kanpai:kanpai@127.0.0.1:${port}/kanpai`,
    hangUp: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/**
 * Point the core module's pool at `url` for what follows. The pool is opened on first use and
 * kept, so the one it already holds is closed first; `restore` puts the test database back.
 */
export async function pointThePoolAt(url: string): Promise<{ restore: () => Promise<void> }> {
  const saved = process.env.DATABASE_URL;
  await closePool();
  process.env.DATABASE_URL = url;

  return {
    restore: async () => {
      await closePool();
      process.env.DATABASE_URL = saved;
    },
  };
}

function listening(onConnection: (socket: Socket) => void = () => {}): Promise<Server> {
  const server = createServer(onConnection);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
