import { beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { getLabel } from "../queries/label.ts";
import { addBottles } from "./bottle.ts";
import { amendLabel, createLabel, markLabelVerified, mergeLabels } from "./label.ts";
import { recordSource } from "./source.ts";
import { recordTasting } from "./tasting.ts";
import { ensureVintage } from "./vintage.ts";
import { addWish } from "./wish.ts";

// Seam 1, against the real Postgres. What is asserted is the Label as `getLabel` reads it
// back — what the owner and the assistant see — and, for each rule, that the database
// itself refuses the row by the rule's name, whoever writes it.
beforeEach(emptyTheCatalogue);

describe("creating a Label", () => {
  it("writes the Label and its first Vintage together", async () => {
    const { labelId, vintageId } = await createLabel({
      producer: " Vietti ",
      name: "Barolo Castiglione",
      kindId: "kind_red",
      country: "Italy",
      region: "Piemonte",
      appellation: "Barolo",
      grapes: ["Nebbiolo", " "],
      unverified: true,
      vintage: 2019,
    });

    expect(labelId).toMatch(/^lbl_[0-9a-f]{24}$/);
    expect(vintageId).toMatch(/^vtg_[0-9a-f]{24}$/);
    expect(await getLabel(labelId)).toMatchObject({
      producer: "Vietti",
      name: "Barolo Castiglione",
      kind: { id: "kind_red", name: "Red", section: "Wine", hasVintages: true },
      grapes: ["Nebbiolo"],
      unverified: true,
      vintages: [{ id: vintageId, dating: "year", year: 2019 }],
    });
  });

  // The assistant records unknown rather than guessing (ADR-0010).
  it("gives a wine with no year said an unknown Vintage, never NV", async () => {
    const { labelId } = await aLabel({ vintage: undefined });

    expect((await getLabel(labelId))?.vintages).toMatchObject([{ dating: "unknown", year: null }]);
  });

  it("gives a Kind without vintages its NV Vintage", async () => {
    const { labelId } = await aLabel({
      producer: "Lagavulin",
      name: "Lagavulin 16",
      kindId: "kind_whisky",
      vintage: undefined,
      ageStatement: "16 years",
      strength: 43,
    });

    expect(await getLabel(labelId)).toMatchObject({
      ageStatement: "16 years",
      strength: 43,
      vintages: [{ dating: "nv", year: null }],
    });
  });

  it("is a non-vintage sparkling when NV is said", async () => {
    const { labelId } = await aLabel({
      name: "Cuvée Imperiale Brut",
      kindId: "kind_sparkling",
      vintage: "nv",
    });

    expect((await getLabel(labelId))?.vintages).toMatchObject([{ dating: "nv" }]);
  });

  it("refuses a year on a Kind without vintages, and writes nothing", async () => {
    await expect(aLabel({ kindId: "kind_whisky", vintage: 2012 })).rejects.toMatchObject({
      code: "invalid",
      constraint: "vintages_of_a_kind_without_vintages_are_nv",
    });
    expect(await query("select 1 from labels")).toEqual([]);
  });

  it("refuses a Kind that does not exist", async () => {
    await expect(aLabel({ kindId: "kind_kombucha" })).rejects.toMatchObject({
      code: "not-found",
      constraint: "labels_kind_exists",
    });
  });

  it("refuses a blank name", async () => {
    await expect(aLabel({ name: "  " })).rejects.toMatchObject({
      code: "invalid",
      constraint: "labels_name_is_not_blank",
    });
  });
});

describe("the database, whoever writes to labels", () => {
  // ADR-0003: a Label always has at least one Vintage. Checked at commit.
  it("refuses a Label committed without a Vintage", async () => {
    await expect(
      query("insert into labels (name, kind_id) values ('Sassicaia', 'kind_red')")
    ).rejects.toMatchObject({ constraint: "labels_have_a_vintage" });
  });

  it("refuses taking a Label's last Vintage away", async () => {
    const { vintageId } = await aLabel();
    await expect(query("delete from vintages where id = $1", [vintageId])).rejects.toMatchObject({
      constraint: "labels_have_a_vintage",
    });
  });

  it("refuses a strength that is not a percentage", async () => {
    await expect(aLabel({ strength: 140 })).rejects.toMatchObject({
      constraint: "labels_strength_is_a_percentage",
    });
  });

  it("refuses a blank grape", async () => {
    const { labelId } = await aLabel();
    await expect(
      query("update labels set grapes = array['Nebbiolo', ''] where id = $1", [labelId])
    ).rejects.toMatchObject({ constraint: "labels_grapes_are_not_blank" });
  });

  it("refuses an own image that is not a web address", async () => {
    await expect(aLabel({ ownImageUrl: "file:///etc/passwd" })).rejects.toMatchObject({
      constraint: "labels_own_image_url_is_a_web_address",
    });
  });

  it("refuses a padded producer", async () => {
    const { labelId } = await aLabel();
    await expect(
      query("update labels set producer = ' Vietti' where id = $1", [labelId])
    ).rejects.toMatchObject({ constraint: "labels_producer_is_not_blank" });
  });

  it("refuses a prefix that is not a Label's", async () => {
    await expect(
      query("insert into labels (id, name, kind_id) values ('vtg_wrong', 'X', 'kind_red')")
    ).rejects.toMatchObject({ constraint: "labels_id_is_prefixed" });
  });

  // The Kind carries the fact, so the rule holds from the Kind's side too.
  it("refuses taking vintages away from a Kind one of whose Labels has a year", async () => {
    await aLabel();
    await expect(
      query("update kinds set has_vintages = false where id = 'kind_red'")
    ).rejects.toMatchObject({ constraint: "kinds_has_vintages_holds_what_its_labels_have" });
  });
});

describe("amending a Label", () => {
  it("changes what is given, clears what is null, and leaves the rest", async () => {
    const { labelId } = await aLabel({ country: "Italy" });

    await amendLabel(labelId, {
      name: "Barolo Castiglione ",
      country: null,
      grapes: ["Nebbiolo", "Barbera"],
    });

    expect(await getLabel(labelId)).toMatchObject({
      producer: "Vietti",
      name: "Barolo Castiglione",
      country: null,
      grapes: ["Nebbiolo", "Barbera"],
    });
  });

  // ADR-0012: a Label may be drawn in a shape that is not its Kind's, and go back to it.
  it("overrides its Kind's bottle shape, and clears the override", async () => {
    const { labelId } = await aLabel({ kindId: "kind_white" });

    await amendLabel(labelId, { bottleShape: "flute" });
    expect((await getLabel(labelId))?.silhouette.shape).toBe("flute");

    await amendLabel(labelId, { bottleShape: null });
    expect(await getLabel(labelId)).toMatchObject({
      bottleShape: null,
      silhouette: { shape: "burgundy" },
    });
  });

  it("refuses a shape nobody drew", async () => {
    const { labelId } = await aLabel();
    await expect(amendLabel(labelId, { bottleShape: "amphora" as never })).rejects.toMatchObject({
      code: "invalid",
      constraint: "labels_bottle_shape_is_known",
    });
  });

  it("does not mark the Label verified", async () => {
    const { labelId } = await aLabel({ unverified: true });
    await amendLabel(labelId, { region: "Langhe" });
    expect((await getLabel(labelId))?.unverified).toBe(true);
  });

  it("moves a Label whose only Vintage is NV to a Kind without vintages", async () => {
    const { labelId } = await aLabel({ name: "Grappa di Barolo", vintage: "nv" });
    await amendLabel(labelId, { kindId: "kind_grappa" });
    expect((await getLabel(labelId))?.kind.id).toBe("kind_grappa");
  });

  // ADR-0010: a whisky with a 2019 would be a lie, and an unknown turned into NV another one.
  it("refuses a Kind without vintages while the Label has a year", async () => {
    const { labelId } = await aLabel();
    await expect(amendLabel(labelId, { kindId: "kind_whisky" })).rejects.toMatchObject({
      code: "invalid",
      constraint: "labels_kind_without_vintages_keeps_only_nv",
    });
  });

  it("refuses a Kind without vintages while the Label has an unknown", async () => {
    const { labelId } = await aLabel({ vintage: "unknown" });
    await expect(
      query("update labels set kind_id = 'kind_whisky' where id = $1", [labelId])
    ).rejects.toMatchObject({ constraint: "labels_kind_without_vintages_keeps_only_nv" });
  });

  it("refuses a Label that does not exist", async () => {
    await expect(amendLabel("lbl_missing", { region: "Langhe" })).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(amendLabel("lbl_missing", {})).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("marking a Label verified", () => {
  it("takes it off the to-check list", async () => {
    const { labelId } = await aLabel({ unverified: true });
    await markLabelVerified(labelId);
    expect((await getLabel(labelId))?.unverified).toBe(false);
  });

  it("refuses a Label that does not exist", async () => {
    await expect(markLabelVerified("lbl_missing")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("merging two Labels", () => {
  it("moves everything onto the survivor and collapses the Vintages both have", async () => {
    const kept = await aLabel({
      producer: "Principe Corsini",
      name: "Le Corti Chianti Classico",
      region: null,
      vintage: 2022,
    });
    const gone = await aLabel({
      producer: "Fattoria le Corti",
      name: "Le Corti Chianti Classico",
      region: "Toscana",
      vintage: 2022,
      unverified: true,
    });
    const goneUnknown = await ensureVintage(gone.labelId, "unknown");

    const [bottleOn2022] = await addBottles(gone.vintageId, 1);
    const tastingOnUnknown = await recordTasting({ vintageId: goneUnknown, rating: 3.5 });
    const tastingOn2022 = await recordTasting({ vintageId: gone.vintageId, rating: 4 });
    const wishOnLabel = await addWish({ labelId: gone.labelId, why: "the 2023" });
    const wishOn2022 = await addWish({ vintageId: gone.vintageId });
    await recordSource(gone.labelId, { source: "vivino", idAtSource: "123" });

    await mergeLabels(kept.labelId, gone.labelId);

    expect(await getLabel(gone.labelId)).toBeNull();
    const survivor = await getLabel(kept.labelId);
    expect(survivor).toMatchObject({
      producer: "Principe Corsini",
      region: "Toscana",
      unverified: false,
      sources: [{ source: "vivino", idAtSource: "123" }],
      score: { latest: 4, average: 3.75, rated: 2 },
    });
    expect(survivor?.vintages).toMatchObject([
      {
        id: kept.vintageId,
        year: 2022,
        bottles: [{ id: bottleOn2022 }],
        tastings: [{ id: tastingOn2022 }],
      },
      { id: goneUnknown, dating: "unknown", tastings: [{ id: tastingOnUnknown }] },
    ]);
    expect(await query("select id, label_id, vintage_id from wishes order by created_at")).toEqual([
      { id: wishOnLabel, label_id: kept.labelId, vintage_id: null },
      { id: wishOn2022, label_id: null, vintage_id: kept.vintageId },
    ]);
  });

  it("refuses merging a Label into itself", async () => {
    const { labelId } = await aLabel();
    await expect(mergeLabels(labelId, labelId)).rejects.toMatchObject({ code: "invalid" });
  });

  it("refuses a Label that does not exist", async () => {
    const { labelId } = await aLabel();
    await expect(mergeLabels(labelId, "lbl_missing")).rejects.toMatchObject({ code: "not-found" });
  });

  it("refuses, moving nothing, a year onto a Label whose Kind has no vintages", async () => {
    const whisky = await aLabel({
      name: "Lagavulin 16",
      kindId: "kind_whisky",
      vintage: undefined,
    });
    const wine = await aLabel();

    await expect(mergeLabels(whisky.labelId, wine.labelId)).rejects.toMatchObject({
      code: "invalid",
      constraint: "vintages_of_a_kind_without_vintages_are_nv",
    });
    expect((await getLabel(wine.labelId))?.vintages).toHaveLength(1);
  });

  it("collapses two NV Vintages of a spirit into one", async () => {
    const kept = await aLabel({ name: "Lagavulin 16", kindId: "kind_whisky", vintage: undefined });
    const gone = await aLabel({
      name: "Lagavulin 16 years",
      kindId: "kind_whisky",
      vintage: undefined,
    });
    await addBottles(gone.vintageId, 2);

    await mergeLabels(kept.labelId, gone.labelId);

    expect((await getLabel(kept.labelId))?.vintages).toMatchObject([
      { id: kept.vintageId, dating: "nv", bottles: [{}, {}] },
    ]);
  });
});
