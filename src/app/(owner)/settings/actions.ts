"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRefusal, Refusal } from "@/core/refusal";
import { issueAccessToken, revokeAccessToken } from "@/core/verbs/access-token";
import {
  addKind,
  amendKind,
  BOTTLE_SHAPES,
  type BottleShape,
  deleteKind,
  LIQUIDS,
  type Liquid,
  moveKind,
  setKindHidden,
} from "@/core/verbs/kind";
import { requireOwner } from "@/lib/auth/owner";
import { at, text } from "../form";

// The write side of `/settings`, thin like every adapter here: read a form, call one verb, say
// what it said. The answer travels back in the address — except a token's secret, which must
// never be in an address (a history, a log, a referrer would keep it): `issue` hands it back to
// the one component that asked, which shows it once.

/** What issuing a token answered: its secret, shown once, or why it was refused. */
export type Issued = { name: string; secret: string } | { refused: string } | null;

export async function issue(_before: Issued, form: FormData): Promise<Issued> {
  await requireOwner();
  try {
    const token = await issueAccessToken(text(form, "name") ?? "");
    revalidatePath("/settings");
    return { name: token.name, secret: token.secret };
  } catch (error) {
    if (!isRefusal(error)) throw error;
    return { refused: error.message };
  }
}

/** Run one verb and come back to the settings, saying what happened or why it was refused. */
async function answer(work: () => Promise<void>, said: string, anchor: string): Promise<never> {
  await requireOwner();
  let to: string;
  try {
    await work();
    to = at("/settings", { said });
  } catch (error) {
    if (!isRefusal(error)) throw error;
    to = at("/settings", { refused: error.message });
  }
  revalidatePath("/", "layout");
  redirect(`${to}#${anchor}`);
}

export async function revoke(form: FormData): Promise<void> {
  await answer(() => revokeAccessToken(text(form, "tokenId") ?? ""), "revoked", "tokens");
}

function aShape(form: FormData): BottleShape {
  const shape = text(form, "bottleShape");
  if (shape && (BOTTLE_SHAPES as readonly string[]).includes(shape)) return shape as BottleShape;
  throw new Refusal("invalid", "Choose one of the bottle shapes offered.");
}

function aLiquid(form: FormData): Liquid {
  const liquid = text(form, "liquid");
  if (liquid && (LIQUIDS as readonly string[]).includes(liquid)) return liquid as Liquid;
  throw new Refusal("invalid", "Choose one of the colours offered.");
}

export async function addAKind(form: FormData): Promise<void> {
  await answer(
    async () => {
      await addKind({
        name: text(form, "name") ?? "",
        section: text(form, "section") ?? "",
        hasVintages: text(form, "hasVintages") === "yes",
        bottleShape: aShape(form),
        liquid: aLiquid(form),
      });
    },
    "kind-added",
    "kinds"
  );
}

export async function amendAKind(form: FormData): Promise<void> {
  await answer(
    () =>
      amendKind(text(form, "kindId") ?? "", {
        name: text(form, "name") ?? "",
        section: text(form, "section") ?? "",
        bottleShape: aShape(form),
        liquid: aLiquid(form),
      }),
    "kind-saved",
    "kinds"
  );
}

export async function moveAKind(form: FormData): Promise<void> {
  await answer(
    () =>
      moveKind(
        text(form, "kindId") ?? "",
        text(form, "direction") === "earlier" ? "earlier" : "later"
      ),
    "kind-moved",
    "kinds"
  );
}

export async function hideAKind(form: FormData): Promise<void> {
  const hidden = text(form, "hidden") === "yes";
  await answer(
    () => setKindHidden(text(form, "kindId") ?? "", hidden),
    hidden ? "kind-hidden" : "kind-shown",
    "kinds"
  );
}

export async function deleteAKind(form: FormData): Promise<void> {
  await answer(() => deleteKind(text(form, "kindId") ?? ""), "kind-deleted", "kinds");
}
