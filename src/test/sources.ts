import { readFileSync } from "node:fs";
import type { Fetch } from "@/core/sources/http";

// Sources that answer from a recording, so no test calls a third party (`AGENTS.md`).
//
// The recordings are under `src/core/sources/fixtures/`: real answers from Open Food Facts and
// from Vivino's Algolia index, taken on 2026-10-12 with the app's own User-Agent, then trimmed
// to the fields the adapters read and a handful of hits. Bodies only — no request or response
// header was kept, so no key is in them.

/** One recorded answer, by its file name under `fixtures/`. */
export function recording(file: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../core/sources/fixtures/${file}`, import.meta.url), "utf8")
  );
}

/** What a fake `fetch` was asked. */
export type Asked = { url: string; init: RequestInit | undefined; body: unknown };

/**
 * A `fetch` that answers each request with what `answer` returns for it: a recording's name,
 * a status with a body, or an error to throw — and keeps what it was asked in `asked`.
 */
export function answering(
  answer: (asked: Asked) => string | { status: number; body?: unknown } | Error
): Fetch & { asked: Asked[] } {
  const asked: Asked[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    const one: Asked = {
      url,
      init,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    asked.push(one);
    const said = answer(one);
    if (said instanceof Error) throw said;
    if (typeof said === "string") return Response.json(recording(said));
    return Response.json(said.body ?? {}, { status: said.status });
  };
  return Object.assign(fetcher, { asked });
}

/** The header `name` of a request a fake `fetch` was asked, whatever its case. */
export function header(asked: Asked, name: string): string | undefined {
  const headers = new Headers(asked.init?.headers);
  return headers.get(name) ?? undefined;
}

/** The error `AbortSignal.timeout` rejects with. */
export function timedOut(): Error {
  return new DOMException("The operation timed out.", "TimeoutError");
}
