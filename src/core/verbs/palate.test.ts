import { beforeEach, describe, expect, it } from "vitest";
import { readPalate } from "../queries/palate.ts";
import { writePalate } from "./palate.ts";

// Seam 1, against the real Postgres. There is one Palate, and writing it replaces it.
beforeEach(async () => {
  await writePalate("");
});

describe("writing the Palate", () => {
  it("replaces the prose and says when", async () => {
    await writePalate("Likes Nebbiolo and dry whites.\n\nCurious about Etna. Up to 30 euro.\n");

    expect(await readPalate()).toEqual({
      prose: "Likes Nebbiolo and dry whites.\n\nCurious about Etna. Up to 30 euro.",
      updatedAt: expect.any(Date),
    });
  });

  it("empties it by writing nothing", async () => {
    await writePalate("Likes Nebbiolo.");
    await writePalate("   ");
    expect((await readPalate()).prose).toBe("");
  });
});
