import { beforeEach, describe, expect, it } from "vitest";
import { emptyTheCatalogue } from "@/test/catalogue";
import { answering, timedOut } from "@/test/sources";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { openFoodFacts } from "../sources/openfoodfacts.ts";
import { vivino } from "../sources/vivino.ts";
import { createLabelFromSource } from "./catalogue.ts";

// Seam 1: a Label made from a chosen candidate, against the real Postgres, with the Source
// answering from a recording (`src/test/sources.ts`). The Source is re-read by its id, and
// what the caller says wins over it (ADR-0011, `CONTEXT.md` **Source**).

beforeEach(emptyTheCatalogue);

const ACCESS = { appId: "9TAKGWJUXL", key: "a-stand-in-for-the-key" };
const COSTASERA = vivino(
  ACCESS,
  answering(() => "vivino-by-id-21929.json")
);

async function labelCount(): Promise<number> {
  const [row] = await query<{ count: number }>("select count(*)::int as count from labels");
  return row?.count ?? 0;
}

describe("creating a Label from a candidate", () => {
  it("re-reads it from Vivino by id and keeps the Source, its bottle shot and its page", async () => {
    const fetcher = answering(() => "vivino-by-id-21929.json");
    const { labelId } = await createLabelFromSource(
      { openfoodfacts: null, vivino: vivino(ACCESS, fetcher) },
      { source: "vivino", idAtSource: "21929" },
      { kindId: "kind_red", vintage: 2015 }
    );

    expect(fetcher.asked[0]?.body).toMatchObject({ filters: "id=21929" });
    const label = await getLabel(labelId);
    expect(label).toMatchObject({
      producer: "Masi",
      name: "Costasera Amarone della Valpolicella Classico",
      kind: { id: "kind_red" },
      country: "Italy",
      region: "Veneto",
      appellation: "Amarone della Valpolicella Classico",
      strength: 15,
      // Born checked: a Source's facts are not what the to-check list is for (ADR-0004).
      unverified: false,
      vintages: [{ dating: "year", year: 2015 }],
      sources: [
        {
          source: "vivino",
          idAtSource: "21929",
          imageUrl: "https://images.vivino.com/thumbs/giuHgypHTM21_kfvNLApCw_pb_x600.png",
          pageUrl: "https://www.vivino.com/w/21929",
        },
      ],
    });
  });

  it("keeps what the caller said over what the Source says", async () => {
    const { labelId } = await createLabelFromSource(
      { openfoodfacts: null, vivino: COSTASERA },
      { source: "vivino", idAtSource: "21929" },
      {
        kindId: "kind_red",
        name: "Costasera",
        appellation: "Amarone della Valpolicella",
        grapes: ["Corvina", "Rondinella", "Oseleta"],
      }
    );

    expect(await getLabel(labelId)).toMatchObject({
      producer: "Masi",
      name: "Costasera",
      appellation: "Amarone della Valpolicella",
      grapes: ["Corvina", "Rondinella", "Oseleta"],
      region: "Veneto",
    });
  });

  it("reads an Open Food Facts record by its barcode, with its strength", async () => {
    const { labelId } = await createLabelFromSource(
      {
        openfoodfacts: openFoodFacts(answering(() => "openfoodfacts-product-5010327755014.json")),
        vivino: null,
      },
      { source: "openfoodfacts", idAtSource: "5010327755014" },
      { kindId: "kind_gin" }
    );

    expect(await getLabel(labelId)).toMatchObject({
      producer: "Hendrick's",
      strength: 41.7,
      vintages: [{ dating: "nv" }],
      sources: [
        {
          source: "openfoodfacts",
          idAtSource: "5010327755014",
          pageUrl: "https://world.openfoodfacts.org/product/5010327755014",
        },
      ],
    });
  });
});

describe("a candidate that cannot be made a Label", () => {
  it("refuses a Source this copy has off", async () => {
    await expect(
      createLabelFromSource(
        { openfoodfacts: null, vivino: null },
        { source: "vivino", idAtSource: "21929" },
        { kindId: "kind_red" }
      )
    ).rejects.toMatchObject({ code: "not-allowed" });
    expect(await labelCount()).toBe(0);
  });

  it("refuses a record the Source does not have", async () => {
    await expect(
      createLabelFromSource(
        {
          openfoodfacts: null,
          vivino: vivino(
            ACCESS,
            answering(() => "vivino-by-id-missing.json")
          ),
        },
        { source: "vivino", idAtSource: "1" },
        { kindId: "kind_red" }
      )
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("says the Source is unavailable when it does not answer, and creates nothing", async () => {
    await expect(
      createLabelFromSource(
        {
          openfoodfacts: null,
          vivino: vivino(
            ACCESS,
            answering(() => timedOut())
          ),
        },
        { source: "vivino", idAtSource: "21929" },
        { kindId: "kind_red" }
      )
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(await labelCount()).toBe(0);
  });

  it("refuses a record that is already a Label's, and leaves no second Label behind", async () => {
    const sources = { openfoodfacts: null, vivino: COSTASERA };
    const chosen = { source: "vivino", idAtSource: "21929" } as const;
    await createLabelFromSource(sources, chosen, { kindId: "kind_red" });

    await expect(
      createLabelFromSource(sources, chosen, { kindId: "kind_red" })
    ).rejects.toMatchObject({ code: "already-exists" });
    expect(await labelCount()).toBe(1);
  });
});
