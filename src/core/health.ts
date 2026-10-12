import "server-only";

import { query } from "./db";

// Whether the database answers, and nothing else: the one question `/healthz` asks for
// whatever runs the image — a Kubernetes readiness probe, a `docker compose` healthcheck.
//
// It sits beside `db.ts` rather than in `queries/` because it is not a question about the
// record. It reads no table and writes nothing: `select 1` over the pool every other query
// uses, so a yes means the connection the app would read through is the one that works, as
// the role the app reads as.
//
// **The answer is a boolean, never the error.** What went wrong — a host name, a role, a
// refused password — is for the log, which the owner reads, and not for the response, which
// anyone who finds the path reads.

/**
 * How long the database has to answer. Short, because a probe has a timeout of its own and
 * a check that outlives it is reported as a failure anyway, without its line in the log.
 */
export const ANSWER_WITHIN_MILLISECONDS = 2000;

/**
 * `true` when `select 1` comes back within `within` milliseconds.
 *
 * The clock covers the connection as well as the statement, which is the reason it is a
 * race and not a `statement_timeout`: a Postgres that accepts the connection and never
 * speaks hangs the pool's connect, before there is a statement to time out. The losing side
 * is left to settle on its own — its rejection is already handled, so nothing is thrown
 * into the void when it finally does.
 */
export async function databaseAnswers(
  within: number = ANSWER_WITHIN_MILLISECONDS
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  let settled = false;

  // Whichever side settles first says why, and the other stays quiet: a connect that times
  // out here and fails a minute later is one failure, not two lines in the log.
  const refused = (reason: string): false => {
    if (!settled) console.warn("The database did not answer", { reason });
    settled = true;
    return false;
  };

  const asked = query("select 1").then(
    () => {
      settled = true;
      return true;
    },
    (error: unknown) => refused(error instanceof Error ? error.message : String(error))
  );
  const late = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(refused(`no answer within ${within}ms`)), within);
  });

  try {
    return await Promise.race([asked, late]);
  } finally {
    clearTimeout(timer);
  }
}
