import { afterAll } from "vitest";
import { closePool } from "@/core/db";
import { resolveTestDatabaseUrl } from "../../db/env.ts";

// Point the core module at the test database rather than the development one. The pool
// opens on first query, so setting the variable here is early enough — importing the
// module does not connect.
//
// `resolveTestDatabaseUrl` is idempotent, which matters because this overwrites the
// variable it derives from: a second pass must not reach for `kanpai_test_test`.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

// No test calls a third party (`AGENTS.md`). A Source is taken as an argument wherever the core
// asks one, and a test hands it one answering from a fixture; this is for the tools, which read
// the copy's configuration — with Open Food Facts off and Vivino unset, the door asks no Source.
//
// `KANPAI_LIVE_SOURCES=1` is the one exception, and it is asked for by hand: it keeps the Vivino
// settings of the shell for `src/core/sources/live.test.ts`, which is skipped without it.
process.env.SOURCES_OPENFOODFACTS = "false";
if (!process.env.KANPAI_LIVE_SOURCES) {
  delete process.env.VIVINO_ALGOLIA_APP_ID;
  delete process.env.VIVINO_ALGOLIA_KEY;
}

afterAll(closePool);
