import "server-only";

import type { SourceName } from "../verbs/source.ts";
import { SourceUnavailable } from "./candidate.ts";

// How kanpai asks a Source a question over HTTP, said once for every Source.
//
// Three rules, from the measurement (`docs/research/sources.md`) and ADR-0011:
//
//   - **An honest User-Agent**, naming the app and where to read about it. Open Food Facts asks
//     for one; Algolia accepts one. Nothing here pretends to be a browser, and an endpoint
//     that refuses an honest User-Agent — vivino.com's own `/api/*`, behind its firewall — is
//     an endpoint this app does not use.
//   - **A few seconds, then no answer.** The owner is waiting on a search; a Source that is
//     slow is reported as unavailable and the search returns what the others said.
//   - **Anything that is not a JSON answer is `SourceUnavailable`**: a 403 HTML page, a 503,
//     a timeout. *No answer*, never *no such bottle* (ADR-0011).

/** `kanpai/<version> (+https://github.com/davideimola/kanpai)`. */
export const USER_AGENT = "kanpai/0.1.0 (+https://github.com/davideimola/kanpai)";

/** How long a Source has to answer, in milliseconds. */
export const SOURCE_TIMEOUT = 4000;

/** `fetch`, as a Source takes it: the real one, or a test's that answers from a fixture. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * One request to a Source, answered as parsed JSON — or `SourceUnavailable`.
 *
 * `notFound` says which statuses mean *the Source has no such record* rather than *the Source
 * did not answer*: a 404 on a barcode is an answer.
 */
export async function askJson(
  source: SourceName,
  fetcher: Fetch,
  url: string,
  init: RequestInit = {},
  notFound: readonly number[] = []
): Promise<unknown | null> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(SOURCE_TIMEOUT),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new SourceUnavailable(
      source,
      timedOut ? "did not answer in time" : "could not be reached",
      {
        cause: error,
      }
    );
  }

  if (notFound.includes(response.status)) return null;
  if (!response.ok) {
    throw new SourceUnavailable(source, `answered ${response.status}`);
  }
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new SourceUnavailable(source, "answered with something that is not JSON", {
      cause: error,
    });
  }
}

/** A protocol-relative image address (`//images.vivino.com/…`) made absolute. */
export function absolute(url: unknown): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return /^https?:\/\//.test(trimmed) ? trimmed : null;
}
