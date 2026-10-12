import type { McpTool } from "./tool.ts";

// How a tool gets mounted, and why it takes exactly one file.
//
// **Every file in `tools/` is a tool area, and the whole directory is the tool list.**
// Adding a question an assistant can ask is adding one file that default-exports its
// tools; the route handler is not touched, this file is not touched, and there is no
// barrel for two slices to conflict in. That is the same argument `src/core/README.md`
// makes for having no `index.ts`, and it matters more here: several slices are each meant
// to expose their own query over this door, so the mounting pass that follows them should
// be one new file each rather than a queue of edits to one line.
//
// The directory is resolved by the application's bundler at build time — a context
// module, verified against `next dev` and against a production `next build`. Two things
// follow, and both are deliberate:
//
//   - it is **not** a filesystem read, because the source tree is not shipped: a
//     `readdir` here would work in development and find nothing in the container;
//   - it does **not** work outside the bundler, which is why the door's own test asks
//     for `initialize` and never for `tools/list`. That costs nothing: the adapters need
//     no tests of their own (ADR-0001), and what the tools answer is Seam 1's business.
//
// The failure mode of a mechanism like this is the dangerous kind — **an empty tool list
// is not an error to anybody**: the door still answers, a client still connects, and the
// assistant simply reports that there is nothing here. So an empty list is refused below
// rather than served. `tools/` having no files in it is not a state this door has, and a
// door that offers nothing is a bug however it got that way.

/** A tool area file: `export default [ … ]`. */
type ToolArea = { default: readonly McpTool[] };

/**
 * A bundler's context module over a directory.
 *
 * A module comes back as a promise as often as not: an area imports `src/core`, which
 * reaches `pg`, and the bundler compiles that graph as an async module. `Promise.resolve`
 * flattens both cases, and getting this wrong is silent — a promise has no `default`, so
 * the tool list is simply empty.
 */
type Directory = { keys(): string[]; (key: string): ToolArea | Promise<ToolArea> };

/**
 * Every tool this door offers, from every area under `tools/`.
 *
 * Sorted by name, so that `tools/list` reads the same twice and a diff of it means
 * something. Two areas claiming one name is a mistake nothing else would catch, so it is
 * caught here rather than served to an assistant as whichever file loaded last.
 */
export async function mountedTools(): Promise<McpTool[]> {
  const tools = (await areas()).flatMap((area) => [...(area.default ?? [])]);

  // Loud, because the alternative is silent. Every way this can go wrong — a bundler that
  // stopped resolving the directory, an area that came back as an unawaited promise, a
  // filter that matches nothing — arrives here as zero tools and as nothing else.
  if (tools.length === 0) {
    throw new Error(
      "No MCP tools were found under `src/lib/mcp/tools/`. That directory is the tool list, " +
        "so an empty one means discovery is broken rather than that the door offers nothing."
    );
  }

  const names = new Set<string>();
  for (const tool of tools) {
    if (names.has(tool.name)) {
      throw new Error(`Two MCP tool areas define \`${tool.name}\`. A tool name is one file's.`);
    }
    names.add(tool.name);
  }

  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

async function areas(): Promise<ToolArea[]> {
  const directory = toolDirectory();
  return await Promise.all(
    directory
      .keys()
      .sort()
      .map((key) => Promise.resolve(directory(key)))
  );
}

function toolDirectory(): Directory {
  // `require` is the bundler's here rather than node's, and in an ES module it is not in
  // scope at all outside one: `typeof` is the only safe way to ask.
  if (typeof require !== "function") {
    throw new Error(
      "MCP tool discovery needs the application bundler: `require.context` is not available. " +
        "It works under `next dev` and in a production build, and not in a bare node process."
    );
  }

  // The call is written out literally because that is what the bundler pattern-matches:
  // handed around through a variable it would compile to a runtime `require` and fail.
  //
  // The filter takes `./story.ts` and leaves `./story.test.ts`, so a test beside an area
  // is not mounted as one.
  //
  // biome-ignore lint/suspicious/noExplicitAny: `require.context` is a build-time construct and has no node type.
  return (require as any).context("./tools", false, /^\.\/[a-z0-9-]+\.ts$/) as Directory;
}
