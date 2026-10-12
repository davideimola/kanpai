import { afterEach, describe, expect, it, vi } from "vitest";

import { aRefusingDatabase, pointThePoolAt } from "@/test/unreachable";

import { GET } from "./route";

// The route a probe asks, at the HTTP edge: the real handler over the real pool, once with
// the test database behind it and once with a port that refuses. `src/proxy.matcher.test.ts`
// pins that it is reachable without a session; this pins what it says when reached.

let undo: (() => Promise<void>) | undefined;

afterEach(async () => {
  await undo?.();
  undo = undefined;
  vi.restoreAllMocks();
});

describe("/healthz", () => {
  it("answers 200 ok while the database answers", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when it does not, and says nothing about why", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const refusing = await aRefusingDatabase();
    undo = (await pointThePoolAt(refusing)).restore;

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("unavailable");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
