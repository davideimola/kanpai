import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { recordSource } from "./source.ts";

// Seam 1, against the real Postgres. A Source is where a Label was found, and the image is
// hotlinked — an address, never bytes (ADR-0006).
beforeEach(emptyTheCatalogue);

describe("recording a Source", () => {
  it("keeps the Source's id, its image and page addresses, and when it was asked", async () => {
    const { labelId } = await aLabel();
    const lookedUpAt = new Date("2026-10-12T10:00:00Z");

    const id = await recordSource(labelId, {
      source: "vivino",
      idAtSource: "1234567",
      imageUrl: "https://images.vivino.com/thumbs/abc.png",
      pageUrl: "https://www.vivino.com/w/1234567",
      lookedUpAt,
    });

    expect(id).toMatch(/^src_[0-9a-f]{24}$/);
    expect((await getLabel(labelId))?.sources).toEqual([
      {
        id,
        source: "vivino",
        idAtSource: "1234567",
        imageUrl: "https://images.vivino.com/thumbs/abc.png",
        pageUrl: "https://www.vivino.com/w/1234567",
        lookedUpAt,
      },
    ]);
  });

  it("refuses the same Source record on a second Label: the two are one", async () => {
    const first = await aLabel();
    const second = await aLabel({ name: "Barolo Castiglione 2019" });
    await recordSource(first.labelId, { source: "openfoodfacts", idAtSource: "8001234567890" });

    await expect(
      recordSource(second.labelId, { source: "openfoodfacts", idAtSource: "8001234567890" })
    ).rejects.toMatchObject({
      code: "already-exists",
      constraint: "label_sources_one_label_per_record",
    });
  });

  it("refuses a Label that does not exist", async () => {
    await expect(
      recordSource("lbl_missing", { source: "vivino", idAtSource: "1" })
    ).rejects.toMatchObject({ code: "not-found", constraint: "label_sources_label_exists" });
  });
});

describe("the database, whoever writes to label_sources", () => {
  it("refuses a Source it does not know", async () => {
    const { labelId } = await aLabel();
    await expect(
      query(
        "insert into label_sources (label_id, source, id_at_source) values ($1, 'wine-searcher', '1')",
        [labelId]
      )
    ).rejects.toMatchObject({ constraint: "label_sources_source_is_known" });
  });

  it("refuses an image that is not a web address", async () => {
    const { labelId } = await aLabel();
    await expect(
      query(
        "insert into label_sources (label_id, source, id_at_source, image_url) values ($1, 'vivino', '1', 'data:image/png;base64,AAAA')",
        [labelId]
      )
    ).rejects.toMatchObject({ constraint: "label_sources_image_url_is_a_web_address" });
  });

  it("refuses a blank id at the Source", async () => {
    const { labelId } = await aLabel();
    await expect(
      query(
        "insert into label_sources (label_id, source, id_at_source) values ($1, 'vivino', '')",
        [labelId]
      )
    ).rejects.toMatchObject({ constraint: "label_sources_id_at_source_is_not_blank" });
  });
});
