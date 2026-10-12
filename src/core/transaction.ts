import "server-only";

import type { PoolClient, QueryResultRow } from "pg";

import { pool, type query } from "./db.ts";

// How a verb that is genuinely several writes stays one write — tsundoku's, taken over with
// its stack (ADR-0001).
//
// The rule is `verbs/README.md`'s: **one verb is one transaction**, and composing two verbs
// in a caller invents a transaction that does not exist. Creating a Label is the first verb
// here that needs it — a Label and its first Vintage are two inserts, and the database
// checks at commit that no Label is left without one — and merging two Labels is the
// largest: a handful of moves that are each a lie on their own.
//
// So a verb that another verb composes takes **where to run** as its last argument,
// defaulting to the pool, and its SQL and refusal prose stay in one place.
//
// It sits beside `db.ts` because what it knows is the pool and not the model. Nothing above
// `src/core` may call it: a door that opened a transaction would be holding domain logic.

/**
 * Where a statement runs: the pool, or one client inside a transaction.
 *
 * Exactly `query`'s shape, so a verb's body does not change and the default costs the
 * caller nothing.
 */
export type Executor = typeof query;

/**
 * Run `work` inside one transaction, on one client, and commit it if it returns.
 *
 * Anything thrown rolls the whole thing back and travels on untouched — a `Refusal` from a
 * verb included. A deferred constraint fails at `commit`, and that error travels the same
 * way, which is why a verb wraps the whole transaction in `refusing` rather than one
 * statement inside it.
 */
export async function transaction<T>(work: (run: Executor) => Promise<T>): Promise<T> {
  const client = await pool().connect();

  try {
    await client.query("begin");
    const answer = await work(runningOn(client));
    await client.query("commit");
    return answer;
  } catch (error) {
    // Best effort: a connection that died mid-transaction cannot be rolled back, and the
    // error worth reporting is the first one rather than the failure to tidy up.
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function runningOn(client: PoolClient): Executor {
  return async <Row extends QueryResultRow>(text: string, values: readonly unknown[] = []) => {
    const result = await client.query<Row>(text, values as unknown[]);
    return result.rows;
  };
}
