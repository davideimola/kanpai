import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Two seams, and there is no third one — tsundoku's, taken over with its stack (ADR-0001).
//
// **Seam 1**, the primary one: the core module's verbs and queries against a **real
// Postgres**. Both doors — the web view and, from S2, the MCP route handler — are thin
// adapters over that core, so this one seam covers both and the adapters need no tests of
// their own. There are deliberately no rendering tests, no component tests and no browser
// runner: what a screen is tested through is the query behind it and the Server Function
// its form posts to.
//
// The derivations are the product — the Cellar out of the Bottles, a Label's score out of
// its Tastings — and they are SQL. Testing them without a database means not testing them.
//
// **Seam 2**, deliberately thin: the gates at the HTTP edge. It is protocol behaviour
// rather than the model — the owner gate in both directions, and the MCP door's. The owner
// gate reaches no database; the MCP door's does, because the tokens it takes are records the
// owner issues (ADR-0009), so `src/app/mcp/route.test.ts` asks the real gate against real
// rows rather than a stand-in for them. The gate is a **pure predicate** with a
// thin adapter over it, and the predicate is tested beside itself
// (`src/lib/auth/gate.test.ts`): environment in, verdict out, a function the gate would
// still have if HTTP were replaced.
//
// **Two files are neither seam, and they are walls**: `src/app/gated.test.ts` and
// `db/migrations/journal.test.ts`. Each is a grep over the source, each catches a failure
// that is silent — a page served ungated, a migration that will never run — and neither
// renders anything. `src/lib/mcp/tools.test.ts` is a third of the same kind over the tool
// list — a schema left open, a tool wording *search first* its own way — and it also drives
// the MCP door's definition of done through the framing, against Seam 1's database.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The core module is `server-only`, which Next resolves through its own
      // bundler alias rather than from `node_modules`. Stubbed so the module is
      // reachable from a test — see the stub for why nothing is lost by it.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Auth.js is transformed rather than loaded as an external package. Its internals
    // import `next/server`, which Next resolves through its own bundler and which
    // node's ESM resolver, reaching for it from inside `next-auth`, does not find.
    // Inlining is what lets Seam 2 exercise the proxy with a real session cookie
    // instead of a mock of the thing under test.
    server: { deps: { inline: ["next-auth", "@auth/core"] } },
    include: ["src/**/*.test.ts", "db/**/*.test.ts"],
    // Brings the container up and applies the schema to the test database, so
    // `pnpm test` is the whole command on a clean clone.
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // One database, so one file at a time. Verbs write, and two files truncating the
    // same tables in parallel would fail in a way that reads as a bug in the verb.
    // A slice that wants speed back should reach for a schema per worker, not for
    // this flag.
    fileParallelism: false,
    // A green run has to mean tests ran: collecting nothing is a broken config, not a
    // pass.
    passWithNoTests: false,
  },
});
