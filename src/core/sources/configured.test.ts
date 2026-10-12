import { describe, expect, it } from "vitest";
import { configuredSources } from "./configured.ts";

// Which Sources a copy asks, from its environment (ADR-0011): Open Food Facts unless turned
// off, Vivino only when the copy's owner gave both the Algolia application id and the key.

describe("the Sources a copy asks", () => {
  it("is Open Food Facts alone when nothing is set: Vivino is off by default", () => {
    const sources = configuredSources({});
    expect(sources.openfoodfacts?.name).toBe("openfoodfacts");
    expect(sources.vivino).toBeNull();
  });

  it("keeps Vivino off with only one of its two settings, or a blank one", () => {
    expect(configuredSources({ VIVINO_ALGOLIA_APP_ID: "9TAKGWJUXL" }).vivino).toBeNull();
    expect(configuredSources({ VIVINO_ALGOLIA_KEY: "k" }).vivino).toBeNull();
    expect(
      configuredSources({ VIVINO_ALGOLIA_APP_ID: "9TAKGWJUXL", VIVINO_ALGOLIA_KEY: "  " }).vivino
    ).toBeNull();
  });

  it("turns Vivino on when the copy's owner sets both", () => {
    const sources = configuredSources({
      VIVINO_ALGOLIA_APP_ID: "9TAKGWJUXL",
      VIVINO_ALGOLIA_KEY: "k",
    });
    expect(sources.vivino?.name).toBe("vivino");
  });

  it("turns Open Food Facts off when told to", () => {
    expect(configuredSources({ SOURCES_OPENFOODFACTS: "false" }).openfoodfacts).toBeNull();
    expect(configuredSources({ SOURCES_OPENFOODFACTS: "true" }).openfoodfacts).not.toBeNull();
  });
});
