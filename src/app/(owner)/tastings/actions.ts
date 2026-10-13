"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal } from "@/core/refusal";
import { editTasting, strikeTasting } from "@/core/verbs/tasting";
import { requireOwner } from "@/lib/auth/owner";
import { text } from "../form";
import { backFrom, backWith, EDIT_PANEL, tastingChangesFrom } from "./tastings";

// The write side of a Tasting's Edit and Delete, and a thin adapter like every other here
// (`AGENTS.md`): read the form, call one verb, and go back to the page the owner pressed it on —
// the Label's, or the diary — saying what happened or why it was refused.

/** Correct a Tasting: every field of the panel is written, an empty one cleared (ADR-0003). */
export async function editATasting(form: FormData): Promise<void> {
  await requireOwner();
  const back = backFrom(text(form, "back"));
  const tastingId = text(form, "tastingId") ?? "";
  let to: string;
  try {
    await editTasting(tastingId, tastingChangesFrom(form));
    to = backWith(back, { said: "tasting-edited" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = backWith(back, { panel: EDIT_PANEL, tasting: tastingId, refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}

/**
 * Delete a Tasting recorded by mistake — or twice: it is struck, and no score counts it. The
 * panel that posts here is the confirmation; there is nothing to undo it with.
 */
export async function deleteATasting(form: FormData): Promise<void> {
  await requireOwner();
  const back = backFrom(text(form, "back"));
  let to: string;
  try {
    await strikeTasting(text(form, "tastingId") ?? "");
    to = backWith(back, { said: "tasting-deleted" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = backWith(back, { refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}
