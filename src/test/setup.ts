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

afterAll(closePool);
