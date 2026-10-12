import { beforeEach, describe, expect, it } from "vitest";
import { query } from "../db.ts";
import { writePalate } from "../verbs/palate.ts";
import { readPalate } from "./palate.ts";

// Seam 1, against the real Postgres. There is exactly one Palate, and it may be empty.
beforeEach(async () => {
  await writePalate("");
});

describe("the Palate", () => {
  it("is there from the first migration, empty until written", async () => {
    expect((await readPalate()).prose).toBe("");
  });

  it("reads back what was written", async () => {
    await writePalate("Curious about Etna.");
    expect((await readPalate()).prose).toBe("Curious about Etna.");
  });
});

describe("the database, whoever writes to palate", () => {
  it("refuses a second Palate", async () => {
    await expect(
      query("insert into palate (id, prose) values ('palate_2', 'another')")
    ).rejects.toMatchObject({ constraint: "palate_is_the_only_one" });
  });

  it("refuses removing the one there is", async () => {
    await expect(query("delete from palate")).rejects.toMatchObject({
      code: "23001",
      constraint: "palate_is_never_removed",
    });
    await expect(query("truncate palate")).rejects.toMatchObject({
      constraint: "palate_is_never_removed",
    });
    expect(await query("select id from palate")).toEqual([{ id: "palate" }]);
  });
});
