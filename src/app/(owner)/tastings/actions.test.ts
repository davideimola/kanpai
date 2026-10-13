import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTasting } from "@/core/queries/tasting";
import { recordTasting } from "@/core/verbs/tasting";
import { aLabel, emptyTheCatalogue } from "@/test/catalogue";
import { deleteATasting, editATasting } from "./actions";

// The Server Functions a Tasting's Edit and Delete panels post to, against the real Postgres:
// what each writes, and the address it answers with. Next's redirect and cache are the
// framework's, stood in for here; the owner gate is the development one, open.

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirected to ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeAll(() => {
  vi.stubEnv("AUTH_DEV_OPEN", "true");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(emptyTheCatalogue);

/** Post `fields` to `action`, and say where it sent the owner. */
async function post(action: (form: FormData) => Promise<void>, fields: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  try {
    await action(form);
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  throw new Error("the action did not redirect");
}

const FIELDS = {
  tastedOn: "2026-10-12",
  rating: "4.5",
  likedIt: "Very much",
  bodyAndFeel: "Full and dry",
  remindedOf: "",
  food: "Steak",
  place: "",
  company: "",
  notes: "",
};

describe("editing a Tasting from the web", () => {
  it("writes the panel's fields, clears the empty ones, and says so where it was pressed", async () => {
    const { vintageId } = await aLabel({ vintage: 2019 });
    const id = await recordTasting({ vintageId, rating: 3, place: "Home", notes: "Opened late" });

    const to = await post(editATasting, { ...FIELDS, tastingId: id, back: "/labels/lbl_x" });
    expect(to).toBe("/labels/lbl_x?said=tasting-edited");
    expect(await getTasting(id)).toMatchObject({
      tastedOn: "2026-10-12",
      rating: 4.5,
      likedIt: "Very much",
      food: "Steak",
      place: null,
      notes: null,
    });

    await post(editATasting, { ...FIELDS, rating: "", tastingId: id, back: "/" });
    expect((await getTasting(id))?.rating).toBeNull();
  });

  it("edits a loose Tasting's description, from the diary", async () => {
    const id = await recordTasting({ description: "A red by the glass" });
    const to = await post(editATasting, {
      ...FIELDS,
      description: "Primitivo by the glass, Puglia",
      tastingId: id,
      back: "/?view=wine",
    });
    expect(to).toBe("/?view=wine&said=tasting-edited");
    expect((await getTasting(id))?.description).toBe("Primitivo by the glass, Puglia");
  });

  it("answers a refusal in the panel, and a Tasting that does not exist", async () => {
    const id = await recordTasting({ description: "A glass" });
    const refused = new URL(
      await post(editATasting, { ...FIELDS, tastedOn: "", tastingId: id, back: "/" }),
      "http://x"
    );
    expect(Object.fromEntries(refused.searchParams)).toEqual({
      panel: "edit-tasting",
      tasting: id,
      refused: "Choose the day you drank it.",
    });

    const missing = await post(editATasting, { ...FIELDS, tastingId: "tst_missing", back: "/" });
    expect(new URL(missing, "http://x").searchParams.get("refused")).toBe(
      "No Tasting has that id."
    );
  });
});

describe("deleting a Tasting from the web", () => {
  it("strikes it, and says so where it was pressed", async () => {
    const id = await recordTasting({ description: "Recorded twice" });
    const kept = await recordTasting({ description: "The one that stays" });

    expect(await post(deleteATasting, { tastingId: id, back: "/" })).toBe("/?said=tasting-deleted");
    expect(await getTasting(id)).toBeNull();
    expect(await getTasting(kept)).not.toBeNull();
  });

  it("refuses one that does not exist, on the page, and never goes elsewhere", async () => {
    const to = await post(deleteATasting, { tastingId: "tst_missing", back: "//example.com" });
    expect(to).toBe(
      `/?refused=${encodeURIComponent("No Tasting has that id.").replace(/%20/g, "+")}`
    );
  });
});
