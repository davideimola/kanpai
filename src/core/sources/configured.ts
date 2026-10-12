import "server-only";

import type { Sources } from "./candidate.ts";
import type { Fetch } from "./http.ts";
import { openFoodFacts } from "./openfoodfacts.ts";
import { vivino } from "./vivino.ts";

// Which Sources this copy asks, read from its environment (ADR-0008, ADR-0011).
//
// The one place a door gets its Sources from. Everything in `src/core` that asks a Source
// takes them as an argument instead, so a test hands it Sources that answer from a fixture and
// nothing under test calls a third party.
//
//   - **Open Food Facts is on** unless `SOURCES_OPENFOODFACTS=false`: open data whose terms
//     invite this use. Off is for a copy that should make no outbound call at all — and for the
//     test run, which sets it.
//   - **Vivino is off** unless both `VIVINO_ALGOLIA_APP_ID` and `VIVINO_ALGOLIA_KEY` are set.
//     Its terms forbid automated access; turning it on is the copy's owner's decision, and the
//     key — Vivino's, public in its own pages, liable to rotate — lives only in their
//     environment.

type Environment = Record<string, string | undefined>;

function setting(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value ? value : undefined;
}

/** The Sources `environment` turns on, asked through `fetcher`. */
export function configuredSources(
  environment: Environment = process.env,
  fetcher: Fetch = fetch
): Sources {
  const appId = setting(environment, "VIVINO_ALGOLIA_APP_ID");
  const key = setting(environment, "VIVINO_ALGOLIA_KEY");
  const openFoodFactsOff = setting(environment, "SOURCES_OPENFOODFACTS")?.toLowerCase() === "false";

  return {
    openfoodfacts: openFoodFactsOff ? null : openFoodFacts(fetcher),
    vivino: appId && key ? vivino({ appId, key }, fetcher) : null,
  };
}
