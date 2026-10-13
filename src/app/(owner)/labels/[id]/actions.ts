"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal, Refusal } from "@/core/refusal";
import { configuredSources } from "@/core/sources/configured";
import {
  addBottles,
  deleteBottle,
  finishBottle,
  type Level,
  openBottle,
  setBottleLevel,
} from "@/core/verbs/bottle";
import { linkLabelToSource } from "@/core/verbs/catalogue";
import { BOTTLE_SHAPES, type BottleShape } from "@/core/verbs/kind";
import { amendLabel, markLabelToCheck, markLabelVerified, mergeLabels } from "@/core/verbs/label";
import { recordTasting } from "@/core/verbs/tasting";
import { setVintageYear, type VintageOf } from "@/core/verbs/vintage";
import { requireOwner } from "@/lib/auth/owner";
import { chosenFrom } from "../../add/search";
import { aList, aNumber, at, text } from "../../form";

// The write side of a Label's page, and a thin adapter like the page (`AGENTS.md`): each one
// reads a form, calls one verb, and says what the verb said. No SQL, no rule about what a Label
// may be, and no constraint name — `refusing` in the core already turned the database's no into
// the owner's words.
//
// The answer travels back in the address, as in tsundoku: a plain form and a redirect work with
// nothing running in the browser. A refusal about a panel's fields comes back with that panel
// open, the sentence beside the fields; one about a press on the page comes back on the page.
//
// Anything that is not a `Refusal` is a bug, not an answer, and is left to become a 500.

const LEVELS: readonly Level[] = ["full", "3/4", "1/2", "1/4"];

function labelPath(form: FormData): string {
  return `/labels/${encodeURIComponent(text(form, "labelId") ?? "")}`;
}

/** Run one verb and go back to the Label, saying what happened or why it was refused. */
async function answer(
  form: FormData,
  work: () => Promise<void>,
  said: string,
  panel?: string
): Promise<never> {
  await requireOwner();
  const path = labelPath(form);
  let to: string;
  try {
    await work();
    to = at(path, { said });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at(path, { panel, refused: error.message });
  }
  revalidatePath(path);
  revalidatePath("/", "layout");
  redirect(to);
}

function aLevel(form: FormData): Level {
  const level = text(form, "level");
  if (level && (LEVELS as readonly string[]).includes(level)) return level as Level;
  throw new Refusal("invalid", "Choose how much is left: full, ¾, ½ or ¼.");
}

/**
 * Which Vintage a panel's form names: one of the Label's own, by its id; NV or unknown, when the
 * Label has no such Vintage yet; or a year the owner typed — found or created with the Bottles or
 * the Tasting, in their transaction.
 */
function aVintage(form: FormData): string | VintageOf {
  const chosen = text(form, "vintage");
  if (chosen === "nv" || chosen === "unknown") {
    return { labelId: text(form, "labelId") ?? "", dating: chosen };
  }
  if (chosen && chosen !== "year") return chosen;
  const year = aNumber(form, "year");
  if (year === null || year === undefined || !Number.isInteger(year)) {
    throw new Refusal("invalid", "Write the year as four figures, like 2019.");
  }
  return { labelId: text(form, "labelId") ?? "", dating: year };
}

/** Correct what the Label says: every field in the panel is written, the empty ones cleared. */
export async function amend(form: FormData): Promise<void> {
  await answer(
    form,
    async () => {
      const strength = aNumber(form, "strength");
      if (strength === undefined) {
        throw new Refusal("invalid", "Write the strength as a number, like 13.5.");
      }
      const shape = text(form, "bottleShape");
      if (shape !== null && !(BOTTLE_SHAPES as readonly string[]).includes(shape)) {
        throw new Refusal("invalid", "Choose one of the bottle shapes offered.");
      }
      await amendLabel(text(form, "labelId") ?? "", {
        name: text(form, "name") ?? "",
        producer: text(form, "producer"),
        kindId: text(form, "kindId") ?? "",
        country: text(form, "country"),
        region: text(form, "region"),
        appellation: text(form, "appellation"),
        grapes: aList(form, "grapes"),
        ageStatement: text(form, "ageStatement"),
        strength,
        ownImageUrl: text(form, "ownImageUrl"),
        bottleShape: shape as BottleShape | null,
      });
    },
    "amended",
    "edit"
  );
}

/** The owner has looked at it: it leaves the to-check page (ADR-0004). */
export async function markChecked(form: FormData): Promise<void> {
  await requireOwner();
  const back = text(form, "from") === "to-check" ? "/to-check" : labelPath(form);
  let to: string;
  try {
    await markLabelVerified(text(form, "labelId") ?? "");
    to = at(back, {
      said: "checked",
      name: text(form, "name") ?? undefined,
      label: text(form, "labelId") ?? undefined,
    });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at(back, { refused: error.message });
  }
  revalidatePath(back);
  revalidatePath("/", "layout");
  redirect(to);
}

/** Undo a *Mark as checked*: the Label goes back on the to-check page (ADR-0004). */
export async function undoChecked(form: FormData): Promise<void> {
  await requireOwner();
  let to: string;
  try {
    await markLabelToCheck(text(form, "labelId") ?? "");
    to = at("/to-check", { said: "unchecked", name: text(form, "name") ?? undefined });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at("/to-check", { refused: error.message });
  }
  revalidatePath("/to-check");
  revalidatePath("/", "layout");
  redirect(to);
}

/**
 * Two Labels are the same one: everything on the one not kept moves onto the one kept, and
 * Vintages of the same year are joined (`mergeLabels`). The page that answers is the kept one's.
 */
export async function merge(form: FormData): Promise<void> {
  await requireOwner();
  const kept = text(form, "keep") ?? "";
  const folded = text(form, "fold") ?? "";
  const from = `/labels/${encodeURIComponent(text(form, "labelId") ?? "")}`;
  let to: string;
  try {
    await mergeLabels(kept, folded);
    to = at(`/labels/${encodeURIComponent(kept)}`, { said: "merged" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at(from, { panel: "merge", q: text(form, "q") ?? undefined, refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}

/**
 * *This is it*: the Label is linked to the candidate the owner chose in *Find it in a
 * catalogue*, re-read from its Source (`linkLabelToSource`, ADR-0011). It gains the photo, the
 * page and the credit; nothing it says changes. A refusal — the record is on another Label, the
 * Source did not answer — comes back in the panel, with the search as it was.
 */
export async function link(form: FormData): Promise<void> {
  await requireOwner();
  const path = labelPath(form);
  const chosen = chosenFrom(text(form, "chosen") ?? undefined);
  let to: string;
  try {
    if (!chosen) throw new Refusal("invalid", "Choose one of the bottles found.");
    const linked = await linkLabelToSource(
      configuredSources(),
      text(form, "labelId") ?? "",
      chosen
    );
    to = at(path, { said: linked.already ? "linked-already" : "linked", source: linked.source });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at(path, { panel: "find", q: text(form, "q") ?? undefined, refused: error.message });
  }
  revalidatePath(path);
  revalidatePath("/", "layout");
  redirect(to);
}

export async function recordATasting(form: FormData): Promise<void> {
  await answer(
    form,
    async () => {
      const rating = aNumber(form, "rating");
      if (rating === undefined) throw new Refusal("invalid", "Choose a rating from the list.");
      const vintage = aVintage(form);
      await recordTasting({
        ...(typeof vintage === "string" ? { vintageId: vintage } : { vintageOf: vintage }),
        tastedOn: text(form, "tastedOn") ?? undefined,
        rating,
        likedIt: text(form, "likedIt"),
        bodyAndFeel: text(form, "bodyAndFeel"),
        remindedOf: text(form, "remindedOf"),
        food: text(form, "food"),
        place: text(form, "place"),
        company: text(form, "company"),
        notes: text(form, "notes"),
      });
    },
    "tasted",
    "taste"
  );
}

export async function addSomeBottles(form: FormData): Promise<void> {
  await answer(
    form,
    async () => {
      const count = aNumber(form, "count");
      if (count === null || count === undefined) {
        throw new Refusal("invalid", "Say how many bottles, like 2.");
      }
      await addBottles(aVintage(form), count, {
        boughtOn: text(form, "boughtOn"),
        price: text(form, "price"),
        boughtWhere: text(form, "boughtWhere"),
      });
    },
    "added",
    "bottles"
  );
}

export async function open(form: FormData): Promise<void> {
  await answer(
    form,
    () => openBottle(text(form, "bottleId") ?? "", { level: aLevel(form) }),
    "opened"
  );
}

export async function setLevel(form: FormData): Promise<void> {
  await answer(form, () => setBottleLevel(text(form, "bottleId") ?? "", aLevel(form)), "level");
}

export async function finish(form: FormData): Promise<void> {
  await answer(form, () => finishBottle(text(form, "bottleId") ?? ""), "finished");
}

export async function remove(form: FormData): Promise<void> {
  await answer(form, () => deleteBottle(text(form, "bottleId") ?? ""), "deleted");
}

/** The year was learned: everything on the unknown Vintage moves to it (ADR-0010). */
export async function setYear(form: FormData): Promise<void> {
  await answer(
    form,
    async () => {
      const year = aNumber(form, "year");
      if (year === null || year === undefined) {
        throw new Refusal("invalid", "Write the year as four figures, like 2019.");
      }
      await setVintageYear({ labelId: text(form, "labelId") ?? "", year });
    },
    "dated"
  );
}
