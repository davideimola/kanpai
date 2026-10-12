"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listKinds } from "@/core/queries/kind";
import { isRefusal, Refusal } from "@/core/refusal";
import { configuredSources } from "@/core/sources/configured";
import { createLabelFromSource } from "@/core/verbs/catalogue";
import { createLabel } from "@/core/verbs/label";
import { requireOwner } from "@/lib/auth/owner";
import { aList, aNumber, at, text } from "../form";
import { chosenFrom, firstVintage, nextStep } from "./search";

// The write side of `/add`, and a thin adapter like the Label page's (`AGENTS.md`): read the
// form, call one verb, and go where the answer says.
//
// **A Label made here is born checked** (ADR-0004, amended 2026-10-12): one made from a
// candidate is checked from any door, because its facts are the Source's, and one the owner
// writes in themselves has been looked at by the one person who would check it. The to-check
// list is for what an assistant read off a photo or a conversation.
//
// **Once it exists, the owner lands on its page with the act they chose open** — Record a
// tasting, or Add bottles — so the panels and the Server Functions behind them are the Label
// page's own, never a second copy of them here. A refusal comes back to `/add` with the panel
// that was open, the sentence beside its fields.

/** The Kind the form names, as the forms offer it: a hidden one is not offered. */
async function theKind(form: FormData) {
  const id = text(form, "kindId");
  const kind = (await listKinds()).find((one) => one.id === id);
  if (!kind) throw new Refusal("invalid", "Choose what it is: a red, a gin, a sake…");
  return kind;
}

/** Make the Label with `make`, then open the chosen act on its page; or come back refused. */
async function made(
  form: FormData,
  back: Record<string, string | undefined>,
  make: () => Promise<{ labelId: string }>
): Promise<never> {
  await requireOwner();
  let to: string;
  try {
    const { labelId } = await make();
    to = at(`/labels/${encodeURIComponent(labelId)}`, {
      panel: nextStep(text(form, "next")),
      said: "made",
    });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at("/add", { q: text(form, "q") ?? undefined, ...back, refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(to);
}

/**
 * A candidate chosen: the Label is made from it, re-read from its Source by its id
 * (`createLabelFromSource`, ADR-0011), with the Kind and the year the owner confirmed.
 */
export async function choose(form: FormData): Promise<void> {
  const chosen = chosenFrom(text(form, "chosen") ?? undefined);
  await made(form, { choose: text(form, "chosen") ?? undefined }, async () => {
    if (!chosen) throw new Refusal("invalid", "Choose one of the bottles found.");
    const kind = await theKind(form);
    return createLabelFromSource(configuredSources(), chosen, {
      kindId: kind.id,
      vintage: firstVintage({ kind, dating: text(form, "dating"), year: text(form, "year") }),
    });
  });
}

/** A bottle no Source knows, or none the owner trusted: written in by hand, with no Source. */
export async function writeIn(form: FormData): Promise<void> {
  await made(form, { panel: "write" }, async () => {
    const kind = await theKind(form);
    const strength = aNumber(form, "strength");
    if (strength === undefined) {
      throw new Refusal("invalid", "Write the strength as a number, like 13.5.");
    }
    return createLabel({
      name: text(form, "name") ?? "",
      producer: text(form, "producer"),
      kindId: kind.id,
      region: text(form, "region"),
      appellation: text(form, "appellation"),
      grapes: aList(form, "grapes"),
      strength,
      unverified: false,
      vintage: firstVintage({ kind, dating: text(form, "dating"), year: text(form, "year") }),
    });
  });
}
