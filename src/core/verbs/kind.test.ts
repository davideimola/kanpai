import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { query } from "../db.ts";
import { listEveryKind, listKinds } from "../queries/kind.ts";
import {
  addKind,
  amendKind,
  BOTTLE_SHAPES,
  deleteKind,
  LIQUIDS,
  moveKind,
  setKindHidden,
} from "./kind.ts";

// Seam 1, against the real Postgres. The Kinds are the one vocabulary the owner writes
// (ADR-0002), so every test here puts the seed back as it found it: the other files read it.
beforeEach(emptyTheCatalogue);

afterEach(async () => {
  await query("delete from kinds where name in ('Kombucha', 'Kefir')");
  await query("update kinds set hidden = false");
  await query("update kinds set name = 'Red', section = 'Wine' where id = 'kind_red'");
  await query("update kinds set bottle_shape = 'bordeaux', liquid = 'red' where id = 'kind_red'");
});

async function orderOf(...ids: string[]): Promise<string[]> {
  return (await listEveryKind()).map((kind) => kind.id).filter((id) => ids.includes(id));
}

describe("adding a Kind", () => {
  it("is a row offered last, drawn as the owner said", async () => {
    const id = await addKind({
      name: " Kombucha ",
      section: "Sake, beer and more",
      hasVintages: false,
      bottleShape: "beer",
      liquid: "amber",
    });

    expect(id).toMatch(/^kind_[0-9a-f]{24}$/);
    expect((await listEveryKind()).at(-1)).toMatchObject({
      id,
      name: "Kombucha",
      section: "Sake, beer and more",
      hasVintages: false,
      bottleShape: "beer",
      liquid: "amber",
      hidden: false,
      labels: 0,
    });
  });

  it("refuses a name another Kind has", async () => {
    await expect(
      addKind({
        name: "Red",
        section: "Wine",
        hasVintages: true,
        bottleShape: "bordeaux",
        liquid: "red",
      })
    ).rejects.toMatchObject({ code: "already-exists", constraint: "kinds_name_key" });
  });

  it("refuses a shape nobody drew", async () => {
    await expect(
      addKind({
        name: "Kombucha",
        section: "Ferments",
        hasVintages: false,
        bottleShape: "amphora" as never,
        liquid: "amber",
      })
    ).rejects.toMatchObject({ code: "invalid", constraint: "kinds_bottle_shape_is_known" });
  });
});

describe("amending a Kind", () => {
  it("renames it, moves it to another section and redraws it, its Labels following", async () => {
    const { labelId } = await aLabel();

    await amendKind("kind_red", {
      name: "Red wine",
      section: "Wines",
      bottleShape: "burgundy",
      liquid: "rose",
    });

    expect((await listEveryKind()).find((kind) => kind.id === "kind_red")).toMatchObject({
      name: "Red wine",
      section: "Wines",
      bottleShape: "burgundy",
      liquid: "rose",
      labels: 1,
    });
    const [label] = await query<{ kind: string }>(
      "select k.name as kind from labels l join kinds k on k.id = l.kind_id where l.id = $1",
      [labelId]
    );
    expect(label?.kind).toBe("Red wine");
  });

  it("refuses a blank section", async () => {
    await expect(amendKind("kind_red", { section: "  " })).rejects.toMatchObject({
      code: "invalid",
      constraint: "kinds_section_is_not_blank",
    });
  });

  it("refuses a liquid with no colour", async () => {
    await expect(amendKind("kind_red", { liquid: "blue" as never })).rejects.toMatchObject({
      code: "invalid",
      constraint: "kinds_liquid_is_known",
    });
  });

  it("refuses a Kind that does not exist", async () => {
    await expect(amendKind("kind_nothing", { name: "Kefir" })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});

describe("reordering the Kinds", () => {
  it("swaps a Kind with the one before it, and back", async () => {
    expect(await orderOf("kind_red", "kind_white")).toEqual(["kind_red", "kind_white"]);

    await moveKind("kind_white", "earlier");
    expect(await orderOf("kind_red", "kind_white")).toEqual(["kind_white", "kind_red"]);

    await moveKind("kind_white", "later");
    expect(await orderOf("kind_red", "kind_white")).toEqual(["kind_red", "kind_white"]);
  });

  it("leaves the first where it is when it is moved earlier", async () => {
    const before = (await listEveryKind()).map((kind) => kind.id);
    await moveKind(before[0] as string, "earlier");
    expect((await listEveryKind()).map((kind) => kind.id)).toEqual(before);
  });
});

describe("hiding a Kind", () => {
  it("leaves it out of the list a form or an assistant picks from, and keeps it", async () => {
    const { labelId } = await aLabel({ kindId: "kind_red" });

    await setKindHidden("kind_red", true);

    expect((await listKinds()).map((kind) => kind.id)).not.toContain("kind_red");
    expect((await listEveryKind()).find((kind) => kind.id === "kind_red")).toMatchObject({
      hidden: true,
      labels: 1,
    });
    const [label] = await query<{ kindId: string }>(
      `select kind_id as "kindId" from labels where id = $1`,
      [labelId]
    );
    expect(label?.kindId).toBe("kind_red");

    await setKindHidden("kind_red", false);
    expect((await listKinds()).map((kind) => kind.id)).toContain("kind_red");
  });
});

describe("deleting a Kind", () => {
  it("deletes one nothing is of", async () => {
    const id = await addKind({
      name: "Kefir",
      section: "Ferments",
      hasVintages: false,
      bottleShape: "beer",
      liquid: "white",
    });

    await deleteKind(id);

    expect((await listEveryKind()).map((kind) => kind.id)).not.toContain(id);
  });

  // A Kind with Labels is never deleted (spec §4): it is hidden instead.
  it("refuses one with Labels, and says to hide it", async () => {
    await aLabel({ kindId: "kind_red" });

    await expect(deleteKind("kind_red")).rejects.toMatchObject({
      code: "not-allowed",
      message: "A Kind with Labels is kept. Hide it instead.",
    });
  });

  it("refuses one that does not exist", async () => {
    await expect(deleteKind("kind_nothing")).rejects.toMatchObject({ code: "not-found" });
  });
});

// The shapes and the liquids are closed sets held twice — as a check in the database and as a
// list the forms offer (ADR-0012). A value in one and not the other is a choice the form offers
// and the database refuses, or a row nothing can draw.
describe("the shapes and the liquids", () => {
  async function checkOf(constraint: string): Promise<string[]> {
    const [row] = await query<{ definition: string }>(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = $1",
      [constraint]
    );
    return [...(row?.definition ?? "").matchAll(/'([a-z]+)'/g)].map((match) => match[1] as string);
  }

  it("are the same in the database and in the forms", async () => {
    expect(await checkOf("kinds_bottle_shape_is_known")).toEqual([...BOTTLE_SHAPES]);
    expect(await checkOf("labels_bottle_shape_is_known")).toEqual([...BOTTLE_SHAPES]);
    expect(await checkOf("kinds_liquid_is_known")).toEqual([...LIQUIDS]);
  });
});
