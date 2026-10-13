"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getWish } from "@/core/queries/wish";
import { isRefusal, Refusal } from "@/core/refusal";
import { addWish, closeWish, reopenWish, type WishEnding } from "@/core/verbs/wish";
import { requireOwner } from "@/lib/auth/owner";
import { at, text } from "../form";

// The write side of the wishlist, and a thin adapter like every other here (`AGENTS.md`): read
// the form, call one verb, and go where the answer says. The answer travels in the address.
//
// **Bought and Tasted close the Wish and open the Label page's own panel** — Add bottles,
// Record a tasting — rather than a second copy of either here. Closing records only how the
// Wish ended (`closeWish`); the Bottles and the Tasting are their own verbs, pressed in that
// panel. A press that changes its mind is undone in the panel itself, as Drop is undone here.

/** Close a Wish, and go on to what its ending asks for: the Label's panel, or the list. */
async function closing(form: FormData, as: WishEnding): Promise<never> {
  await requireOwner();
  const wishId = text(form, "wishId") ?? "";
  let to: string;
  try {
    await closeWish(wishId, as);
    const wish = await getWish(wishId);
    if (!wish) throw new Refusal("not-found", "No Wish has that id.");
    to =
      as === "dropped"
        ? at("/wishlist", { said: "dropped", wish: wishId, name: text(form, "name") ?? undefined })
        : at(`/labels/${encodeURIComponent(wish.labelId)}`, {
            panel: as === "bought" ? "bottles" : "taste",
            wish: wishId,
          });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at("/wishlist", { refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}

/** It was bought: the Wish closes, and the Label's Add bottles panel opens. */
export async function bought(form: FormData): Promise<void> {
  await closing(form, "bought");
}

/** It was tasted: the Wish closes, and the Label's Record a tasting panel opens. */
export async function tasted(form: FormData): Promise<void> {
  await closing(form, "tasted");
}

/** Not wanted any more: the Wish closes as dropped, with an undo on the list. */
export async function drop(form: FormData): Promise<void> {
  await closing(form, "dropped");
}

/** Undo Bought, Tasted or Drop: the Wish is open again, back on the list. */
export async function reopen(form: FormData): Promise<void> {
  await requireOwner();
  let to: string;
  try {
    await reopenWish(text(form, "wishId") ?? "");
    to = at("/wishlist", { said: "reopened", name: text(form, "name") ?? undefined });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at("/wishlist", { refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}

/**
 * Wish for a Label, from its page: why, and where the idea came from. A Label is wished for
 * once: when it is on the list already, `addWish` says so rather than adding a second.
 */
export async function wish(form: FormData): Promise<void> {
  await requireOwner();
  const labelId = text(form, "labelId") ?? "";
  const page = `/labels/${encodeURIComponent(labelId)}`;
  let to: string;
  try {
    await addWish({ labelId, why: text(form, "why"), cameFrom: text(form, "cameFrom") });
    to = at(page, { said: "wished" });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at(page, { panel: "wish", refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}
