import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One wall in this app is a grep over the source, because the failure it catches is
// silent: a page added outside the gated route group still compiles, still renders and
// still reads the database — it has simply been served to whoever has the URL
// (`src/app/gated.test.ts`).
//
// It needs every source file and its text, so the walk lives here rather than in the
// wall. What the wall *looks for* stays in the wall: that is the review surface.

/** The application's source root, `src/`. */
export const SRC = fileURLToPath(new URL("..", import.meta.url));

export type SourceFile = {
  /** Relative to the root it was found under, so an expectation reads as a path. */
  readonly file: string;
  readonly source: string;
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every TypeScript file under `root`, with its text, sorted by path. */
export function sourceFiles(root: string): SourceFile[] {
  return walk(root)
    .map((full) => ({ file: path.relative(root, full), source: readFileSync(full, "utf8") }))
    .sort((a, b) => a.file.localeCompare(b.file));
}
