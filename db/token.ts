import { registerHooks } from "node:module";
import { requireDatabaseUrl } from "./env.ts";

// The first token, from a shell (ADR-0009).
//
//   pnpm token:issue <name>    issue a token named after where it goes, and print its secret once
//   pnpm token:list            every token: name, when issued, when last used, whether revoked
//   pnpm token:revoke <id>     refuse that token from now on
//
// The MCP door fails closed: with no token issued, every request is a 401. The owner issues
// tokens from `/settings` once the web view has one (S4); until then, and for a fresh copy
// with no browser at hand, this is how the first one is made. It calls the same verbs that
// page will, so the two cannot disagree about what a token is.
//
// It runs wherever `db/cli.ts migrate` runs — on a laptop, and inside the published image,
// which carries `src/core` beside `db/` for this file's sake (see the `Dockerfile`):
//
//   docker compose exec app node --experimental-strip-types \
//     --disable-warning=MODULE_TYPELESS_PACKAGE_JSON db/token.ts issue Claude

const USAGE = `usage: node db/token.ts <issue <name> | list | revoke <id>>

  issue <name>   issue a token named after where it goes (Claude, laptop, tunnel)
                 and print its secret, which is shown this once and kept nowhere
  list           every token issued: name, created, last used, revoked
  revoke <id>    refuse that token at /mcp from now on
`;

// `src/core` is `server-only`, which Next resolves through its own bundler and vitest through
// the stub `vitest.config.ts` names. Node resolves it through neither, and no such package is
// installed — so this says the same thing a third time, as tsundoku's `db/convert/cli.ts`
// does. As an empty module written inline rather than a path to the stub, because the image
// ships no `src/test/`. Registered before the core is loaded, which is why the verbs below are
// reached by a dynamic import rather than a hoisted one.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    return next(specifier, context);
  },
});

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function when(date: Date | null): string {
  return date ? date.toISOString().replace("T", " ").slice(0, 16) : "—";
}

async function main(): Promise<void> {
  const [command, argument, ...rest] = process.argv.slice(2);
  if (
    rest.length > 0 ||
    !(
      (command === "issue" && argument) ||
      (command === "revoke" && argument) ||
      (command === "list" && !argument)
    )
  ) {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }

  // Read before the core is: the pool takes `DATABASE_URL` off the environment when it is
  // first touched, and `.env.local` is where the local loop keeps it.
  requireDatabaseUrl();
  const { closePool } = await import("../src/core/db.ts");
  const { isRefusal } = await import("../src/core/refusal.ts");

  try {
    if (command === "issue") {
      const { issueAccessToken } = await import("../src/core/verbs/access-token.ts");
      const token = await issueAccessToken(argument ?? "");
      out(`issued ${token.id} "${token.name}"`);
      out();
      out(`  ${token.secret}`);
      out();
      out("This is the only time the secret is shown. Paste it into the client now:");
      out("it is stored as a hash, and a lost one is revoked and issued again.");
    } else if (command === "revoke") {
      const { revokeAccessToken } = await import("../src/core/verbs/access-token.ts");
      await revokeAccessToken(argument ?? "");
      out(`revoked ${argument}`);
    } else {
      const { listAccessTokens } = await import("../src/core/queries/access-token.ts");
      const tokens = await listAccessTokens();
      if (tokens.length === 0) out("no token issued yet: /mcp refuses everything");
      for (const token of tokens) {
        const state = token.revokedAt ? `revoked ${when(token.revokedAt)}` : "live";
        out(
          `${token.id}  ${token.name.padEnd(16)}  issued ${when(token.createdAt)}  ` +
            `last used ${when(token.lastUsedAt).padEnd(16)}  ${state}`
        );
      }
    }
  } catch (error) {
    // A refusal is the owner's mistake and is said in the verb's prose; anything else is a
    // bug, and travels on to be printed as one.
    if (!isRefusal(error)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
