import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { answering, timedOut } from "@/test/sources";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { openFoodFacts } from "../sources/openfoodfacts.ts";
import { vivino } from "../sources/vivino.ts";
import { createLabelFromSource, linkLabelToSource } from "./catalogue.ts";

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

describe("linking a Label to a candidate", () => {
  it("re-reads the record and gives the Label its photo and page, changing nothing it says", async () => {
    const { labelId } = await aLabel({
      producer: "Masi",
      name: "Costasera",
      region: null,
      appellation: null,
      grapes: [],
      unverified: true,
      vintage: 2015,
    });
    const fetcher = answering(() => "vivino-by-id-21929.json");

    const linked = await linkLabelToSource(
      { openfoodfacts: null, vivino: vivino(ACCESS, fetcher) },
      labelId,
      { source: "vivino", idAtSource: "21929" }
    );

    expect(fetcher.asked[0]?.body).toMatchObject({ filters: "id=21929" });
    expect(linked).toMatchObject({
      sourceId: expect.stringMatching(/^src_/),
      source: "vivino",
      imageUrl: "https://images.vivino.com/thumbs/giuHgypHTM21_kfvNLApCw_pb_x600.png",
      pageUrl: "https://www.vivino.com/w/21929",
      already: false,
    });
    const label = await getLabel(labelId);
    expect(label).toMatchObject({
      // What the owner (or the assistant) wrote stays: a Source never overwrites it.
      producer: "Masi",
      name: "Costasera",
      region: null,
      appellation: null,
      strength: null,
      // A link vouches for no fact the assistant wrote, so it stays on the to-check list.
      unverified: true,
      silhouette: {
        imageUrl: "https://images.vivino.com/thumbs/giuHgypHTM21_kfvNLApCw_pb_x600.png",
      },
      sources: [
        {
          id: linked.sourceId,
          source: "vivino",
          idAtSource: "21929",
          pageUrl: "https://www.vivino.com/w/21929",
          lookedUpAt: expect.any(Date),
        },
      ],
    });
  });

  it("changes nothing when the Label has that record already", async () => {
    const { labelId } = await aLabel();
    const sources = { openfoodfacts: null, vivino: COSTASERA };
    const chosen = { source: "vivino", idAtSource: "21929" } as const;
    const first = await linkLabelToSource(sources, labelId, chosen);

    const again = await linkLabelToSource(sources, labelId, chosen);
    expect(again).toMatchObject({ sourceId: first.sourceId, already: true });
    expect((await getLabel(labelId))?.sources).toHaveLength(1);
  });

  it("takes a second record, from the other Source", async () => {
    const { labelId } = await aLabel();
    await linkLabelToSource({ openfoodfacts: null, vivino: COSTASERA }, labelId, {
      source: "vivino",
      idAtSource: "21929",
    });
    await linkLabelToSource(
      {
        openfoodfacts: openFoodFacts(answering(() => "openfoodfacts-product-5010327755014.json")),
        vivino: null,
      },
      labelId,
      { source: "openfoodfacts", idAtSource: "5010327755014" }
    );

    expect((await getLabel(labelId))?.sources.map((one) => one.source).sort()).toEqual([
      "openfoodfacts",
      "vivino",
    ]);
  });

  it("refuses a record already on another Label, and says which", async () => {
    const sources = { openfoodfacts: null, vivino: COSTASERA };
    const chosen = { source: "vivino", idAtSource: "21929" } as const;
    const { labelId: holder } = await createLabelFromSource(sources, chosen, {
      kindId: "kind_red",
    });
    const { labelId } = await aLabel();

    const refused = linkLabelToSource(sources, labelId, chosen);
    await expect(refused).rejects.toMatchObject({ code: "already-exists" });
    await expect(refused).rejects.toThrow(
      `That Vivino record is already on another Label, Costasera Amarone della Valpolicella Classico, Masi (${holder}).`
    );
    expect((await getLabel(labelId))?.sources).toEqual([]);
  });

  it("refuses a Label that does not exist, without asking the Source", async () => {
    const fetcher = answering(() => "vivino-by-id-21929.json");
    await expect(
      linkLabelToSource({ openfoodfacts: null, vivino: vivino(ACCESS, fetcher) }, "lbl_missing", {
        source: "vivino",
        idAtSource: "21929",
      })
    ).rejects.toMatchObject({ code: "not-found" });
    expect(fetcher.asked).toEqual([]);
  });

  it("refuses a Source this copy has off, and one that does not answer", async () => {
    const { labelId } = await aLabel();
    const chosen = { source: "vivino", idAtSource: "21929" } as const;
    await expect(
      linkLabelToSource({ openfoodfacts: null, vivino: null }, labelId, chosen)
    ).rejects.toMatchObject({ code: "not-allowed" });
    await expect(
      linkLabelToSource(
        {
          openfoodfacts: null,
          vivino: vivino(
            ACCESS,
            answering(() => timedOut())
          ),
        },
        labelId,
        chosen
      )
    ).rejects.toMatchObject({ code: "unavailable" });
    expect((await getLabel(labelId))?.sources).toEqual([]);
  });
});
