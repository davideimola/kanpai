"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writePalate } from "@/core/verbs/palate";
import { requireOwner } from "@/lib/auth/owner";

// The write side of `/palate`, thin like every adapter here: read the form, call one verb, say
// what it did. `update_palate`'s semantics, from the web: the whole prose is replaced by what
// was in the field, and an empty field empties it.

export async function save(form: FormData): Promise<void> {
  await requireOwner();
  const prose = form.get("prose");
  const written = typeof prose === "string" ? prose : "";
  await writePalate(written);
  revalidatePath("/palate");
  redirect(`/palate?said=${written.trim() === "" ? "emptied" : "saved"}`);
}
