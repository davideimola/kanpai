import { describe, expect, it } from "vitest";
import { answering, header, timedOut } from "@/test/sources";
import { SourceUnavailable } from "./candidate.ts";
import { USER_AGENT } from "./http.ts";
import { vivino } from "./vivino.ts";

// The Vivino adapter against recorded answers from its Algolia index (`src/test/sources.ts`).
// The key here is a stand-in: the real one is Vivino's, lives only in a copy's environment,
// and is in no file of this repository (ADR-0011).

const ACCESS = { appId: "9TAKGWJUXL", key: "a-stand-in-for-the-key" };

describe("Vivino, searched by name", () => {
  it("asks Algolia's index, never vivino.com, with the key and an honest User-Agent", async () => {
    const fetcher = answering(() => "vivino-search-masi-costasera.json");
    await vivino(ACCESS, fetcher).search("Masi Costasera");

    const [asked] = fetcher.asked;
    if (!asked) throw new Error("nothing was asked");
    expect(asked.url).toBe("https://9takgwjuxl-dsn.algolia.net/1/indexes/WINES_prod/query");
    expect(asked.init?.method).toBe("POST");
    expect(asked.body).toEqual({ query: "Masi Costasera", hitsPerPage: 10 });
    expect(header(asked, "x-algolia-application-id")).toBe("9TAKGWJUXL");
    expect(header(asked, "x-algolia-api-key")).toBe("a-stand-in-for-the-key");
    expect(header(asked, "user-agent")).toBe(USER_AGENT);
    expect(header(asked, "user-agent")).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  it("maps a wine: the winery, the appellation and its region, the bottle shot, the years", async () => {
    const [costasera] = await vivino(
      ACCESS,
      answering(() => "vivino-search-masi-costasera.json")
    ).search("Masi Costasera");

    expect(costasera).toEqual({
      source: "vivino",
      idAtSource: "21929",
      producer: "Masi",
      name: "Costasera Amarone della Valpolicella Classico",
      kind: "kind_red",
      country: "Italy",
      region: "Veneto",
      appellation: "Amarone della Valpolicella Classico",
      grapes: [],
      strength: 15,
      vintages: [2024, 2023, 2022, 2021],
      imageUrl: "https://images.vivino.com/thumbs/giuHgypHTM21_kfvNLApCw_pb_x600.png",
      pageUrl: "https://www.vivino.com/w/21929",
      attribution: expect.stringContaining("Vivino"),
    });
  });

  it("maps a user-entered spirit: no producer, no Kind, the photo it lists and not a bottle shot", async () => {
    const [hendricks] = await vivino(
      ACCESS,
      answering(() => "vivino-search-hendricks-gin.json")
    ).search("Hendrick's gin");

    expect(hendricks).toMatchObject({
      idAtSource: "1185152",
      producer: null,
      name: "Hendrick's Gin",
      kind: null,
      strength: null,
      vintages: ["nv"],
      imageUrl: "https://images.vivino.com/thumbs/00xzyy1nzmegb_375x500.jpg",
    });
    expect(hendricks?.imageUrl).not.toContain("_pb_");
  });
});

describe("Vivino, re-read by id", () => {
  it("asks Algolia with a filter on the id and no words", async () => {
    const fetcher = answering(() => "vivino-by-id-21929.json");
    const costasera = await vivino(ACCESS, fetcher).byId("21929");

    expect(fetcher.asked[0]?.body).toEqual({ query: "", filters: "id=21929", hitsPerPage: 1 });
    expect(costasera).toMatchObject({ idAtSource: "21929", producer: "Masi" });
  });

  it("answers no record for an id it does not have, and does not ask for one that is not an id", async () => {
    const fetcher = answering(() => "vivino-by-id-missing.json");
    expect(await vivino(ACCESS, fetcher).byId("1")).toBeNull();
    expect(await vivino(ACCESS, fetcher).byId("id=1 OR 1")).toBeNull();
    expect(fetcher.asked).toHaveLength(1);
  });
});

describe("Vivino not answering", () => {
  it("is unavailable when Algolia refuses the key — it may have rotated", async () => {
    const source = vivino(
      ACCESS,
      answering(() => ({ status: 403, body: { message: "Invalid Application-ID or API key" } }))
    );
    await expect(source.search("Sassicaia")).rejects.toBeInstanceOf(SourceUnavailable);
    await expect(source.byId("5078")).rejects.toThrow("answered 403");
  });

  it("is unavailable when it does not answer in time", async () => {
    const source = vivino(
      ACCESS,
      answering(() => timedOut())
    );
    await expect(source.search("Sassicaia")).rejects.toThrow("did not answer in time");
  });
});
