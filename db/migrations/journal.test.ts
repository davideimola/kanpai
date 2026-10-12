import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// **THE JOURNAL HAS TO CLIMB**, and this is the wall that says so.
//
// Drizzle's migrator keeps no set of files a database has seen. It reads the newest
// `created_at` in `drizzle.__drizzle_migrations` — one row per applied file, holding that
// file's `when` from this journal — and then applies every migration whose `when` is
// **greater** than that one number. It is a watermark, not a set, and it is read once per run.
//
// So a `when` that sorts behind one already applied is a migration that will never run
// anywhere, and **nothing says so**: `pnpm db:migrate` reports success, a fresh database is
// built correctly because an empty table has no watermark, and every test passes for the same
// reason. The only surface that finds out is production, where the column is missing and the
// page is a 500. That is not a hypothesis: it happened to tsundoku, whose journal carried
// hand-written `when`s a day apart into the future, and a deploy shipped code for a schema the
// database was never given. This file is copied from there so it cannot happen here.
//
// It reads files and needs no database, which is the point: the failure is in the journal
// rather than in any schema, and a test that needed the schema could not have seen it.
const HERE = fileURLToPath(new URL(".", import.meta.url));

type Entry = { idx: number; when: number; tag: string };

const journal: { entries: Entry[] } = JSON.parse(
  readFileSync(new URL("./meta/_journal.json", import.meta.url), "utf8")
);

describe("the migration journal", () => {
  it("climbs, so that no migration sorts behind one already applied", () => {
    const behind: string[] = [];
    let mark = 0;

    for (const entry of journal.entries) {
      if (entry.when <= mark) behind.push(entry.tag);
      mark = Math.max(mark, entry.when);
    }

    // Named rather than counted: what a reader needs is *which* file will be skipped, and the
    // number to put its `when` past is the largest one above it. The list is empty and is
    // meant to stay so — the rule is past the highest mark already applied, never between.
    expect(behind).toEqual([]);
  });

  // The other half of the same convention. `pnpm db:generate` names a file something random
  // and the README says rename it **and** the tag; a rename that touched one of the two leaves
  // the migrator reading a file that is not there, or leaves a file nothing will ever apply.
  it("names a file that exists, for every entry and every file", () => {
    const onDisk = readdirSync(HERE)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.replace(/\.sql$/, ""))
      .sort();

    expect(journal.entries.map((entry) => entry.tag).sort()).toEqual(onDisk);
  });

  it("is in the order it is applied in", () => {
    const indices = journal.entries.map((entry) => entry.idx);

    expect([...indices].sort((one, other) => one - other)).toEqual(indices);
  });
});
