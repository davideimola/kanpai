import { afterEach, describe, expect, it, vi } from "vitest";

import { aRefusingDatabase, aSilentDatabase, pointThePoolAt } from "@/test/unreachable";

import { databaseAnswers } from "./health";

// Seam 1, for the one question in the core that is not about the record: whether the
// database answers at all. Against the real test database for the yes, and against a real
// socket for each no — nothing in the pool is mocked.

let undo: (() => Promise<void>) | undefined;

afterEach(async () => {
  await undo?.();
  undo = undefined;
  vi.restoreAllMocks();
});

describe("whether the database answers", () => {
  it("answers yes when Postgres does", async () => {
    expect(await databaseAnswers()).toBe(true);
  });

  it("answers no when nothing is listening", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    undo = (await pointThePoolAt(await aRefusingDatabase())).restore;

    expect(await databaseAnswers()).toBe(false);
  });

  // The case the clock is for. A connection accepted and never answered does not fail on its
  // own for as long as the kernel cares to wait, which is far longer than a probe does.
  it("answers no in time when the server accepts and never speaks", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const silent = await aSilentDatabase();
    const pointed = await pointThePoolAt(silent.url);
    undo = async () => {
      await silent.hangUp();
      await pointed.restore();
    };

    const started = Date.now();
    expect(await databaseAnswers(50)).toBe(false);
    // The clock answered, and not a refusal that happened to come first.
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  // Once, and never with the reason in the answer: that is for the log the owner reads.
  it("says why in the log, once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    undo = (await pointThePoolAt(await aRefusingDatabase())).restore;

    await databaseAnswers();

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
