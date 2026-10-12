import { describe, expect, it } from "vitest";
import { openFoodFacts } from "./openfoodfacts.ts";
import { vivino } from "./vivino.ts";

// The one test that calls a third party, and it is **skipped unless asked for**:
//
//   KANPAI_LIVE_SOURCES=1 pnpm test src/core/sources/live.test.ts
//
// with `VIVINO_ALGOLIA_APP_ID` and `VIVINO_ALGOLIA_KEY` in the shell to include Vivino. It is
// how to learn that a Source moved — an endpoint, a field, a rotated key — before the owner
// does; CI never runs it, because a test that fails when someone else's service is down is not
// a test of this app. A few requests, spaced by the test runner, with the honest User-Agent.

const live = Boolean(process.env.KANPAI_LIVE_SOURCES);
const appId = process.env.VIVINO_ALGOLIA_APP_ID;
const key = process.env.VIVINO_ALGOLIA_KEY;

describe.skipIf(!live)("the Sources, live", () => {
  it("Open Food Facts still reads Hendrick's by its barcode, with its strength", async () => {
    const hendricks = await openFoodFacts().byId("5010327755014");
    expect(hendricks).toMatchObject({ producer: "Hendrick's", kind: "kind_gin" });
    expect(hendricks?.strength).toBeGreaterThan(40);
  }, 15_000);

  it("Open Food Facts still finds Hendrick's by name", async () => {
    const found = await openFoodFacts().search("Hendrick's gin");
    expect(found.some((one) => one.producer?.startsWith("Hendrick"))).toBe(true);
  }, 15_000);

  it.skipIf(!appId || !key)(
    "Vivino still finds Masi Costasera first, with a bottle shot",
    async () => {
      const [first] = await vivino({ appId: appId ?? "", key: key ?? "" }).search("Masi Costasera");
      expect(first).toMatchObject({ idAtSource: "21929", producer: "Masi" });
      expect(first?.imageUrl).toContain("_pb_");
    },
    15_000
  );
});
