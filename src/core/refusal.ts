import "server-only";

// How a refusal crosses the core's edge — tsundoku's, taken over with its stack (ADR-0001).
//
// Invariants live in Postgres: the database refuses what must never be true rather than
// trusting this module to remember (see `README.md`). That leaves one question, and this
// file is the only answer to it — what a verb throws when the database says no, and what an
// adapter is allowed to know about it.
//
// **A refusal is domain vocabulary, not a `pg` error.** Nothing above `src/core` may see a
// driver error, read a SQLSTATE or match a constraint name: the web view and the MCP route
// handler are thin adapters, and a `pg` error reaching either means the core leaked its own
// implementation. So every verb that can be refused wraps its statement in `refusing` and a
// `Refusal` comes out.
//
// The mapping is **by SQLSTATE, never by message**. The triggers in the migrations raise with
// a standard integrity code and name the rule they hold as the `constraint`, so a trigger's
// refusal reaches this file exactly as a check constraint's does.
//
// Anything that is *not* a `Refusal` is a bug rather than an answer. It stays unhandled on
// purpose: the adapter turns it into a 500 and nobody dresses it up as advice to the owner.

/**
 * Why the database said no, in four cases an adapter can act on — and a fifth that is not the
 * database's: a Source that was asked and did not answer.
 *
 * Machine-readable and stable — the MCP door hands these to an assistant, which reads
 * `already-exists` and tries something else, where prose would only be re-guessed.
 */
export type RefusalCode =
  /** The thing is already there. A unique constraint refused a duplicate. */
  | "already-exists"
  /** The thing named does not exist, so there was nothing to act on. */
  | "not-found"
  /** It exists, and the model forbids this of it — deleting a finished Bottle. */
  | "not-allowed"
  /** The value itself is wrong: a Rating of 4.3, a blank name, a year on a whisky. */
  | "invalid"
  /**
   * A Source had to be asked and did not answer (ADR-0011). Not the owner's mistake and not
   * the model's: trying again later may work, and so does going on without it.
   */
  | "unavailable";

/**
 * A refusal the owner (or an assistant) is meant to read.
 *
 * Carries prose written by the verb, because only the verb knows what the owner was trying
 * to do — never a message derived from a constraint name.
 */
export class Refusal extends Error {
  readonly code: RefusalCode;
  /** The constraint that refused, when one did. For diagnosis, never for display. */
  readonly constraint?: string;

  constructor(
    code: RefusalCode,
    message: string,
    options: { constraint?: string; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "Refusal";
    this.code = code;
    this.constraint = options.constraint;
  }
}

/** Whether an error is a refusal — the one question an adapter asks. */
export function isRefusal(error: unknown): error is Refusal {
  return error instanceof Refusal;
}

// The SQLSTATEs that mean "the model refused this", and the code each becomes.
//
// Only integrity violations are here. A syntax error, a missing column or a dead connection
// are this repo's mistakes, not the owner's, and they must not be laundered into something
// that looks like an answer.
const BY_SQLSTATE: Record<string, RefusalCode> = {
  "23505": "already-exists", // unique_violation
  "23503": "not-found", // foreign_key_violation — the thing referred to is not there
  "23514": "invalid", // check_violation — a check, or a trigger holding one across tables
  "23502": "invalid", // not_null_violation
  "23001": "not-allowed", // restrict_violation — a trigger refusing an act on what exists
  "23P01": "not-allowed", // exclusion_violation
};

type DatabaseError = { code?: string; constraint?: string };

/**
 * Run a verb's statement and translate an integrity violation into a `Refusal`.
 *
 * `message` is what the owner reads. Pass a function when the prose depends on which
 * constraint refused; the constraint name is the argument, and it is `undefined` when the
 * driver did not name one.
 *
 * Anything the database refuses for another reason, and anything that is not a database
 * error at all, is rethrown untouched — a `Refusal` thrown inside `work` included.
 */
export async function refusing<T>(
  work: () => Promise<T>,
  message: string | ((constraint: string | undefined) => string)
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refusal) throw error;
    const sqlstate = (error as DatabaseError | null)?.code;
    const code = sqlstate ? BY_SQLSTATE[sqlstate] : undefined;
    if (!code) throw error;

    const constraint = (error as DatabaseError).constraint;
    const prose = typeof message === "function" ? message(constraint) : message;
    throw new Refusal(code, prose, { constraint, cause: error });
  }
}
