import { Refusal } from "@/core/refusal";
import type { TastingFacts } from "@/core/verbs/tasting";
import { aNumber, text } from "../form";

// A TASTING, EDITED OR DELETED FROM THE WEB: what the form says, and where the answer goes.
// Pure functions over a form and an address, tested beside themselves (`./tastings.test.ts`);
// `./actions.ts` is the thin part that calls the verbs, and `./panels.tsx` the markup.
//
// A Tasting is shown in two places — on its Label's page, and in the diary, which is the only
// place a loose one is shown (ADR-0005) — so Edit and Delete open a panel on whichever page the
// owner was on, and the answer comes back there: the form carries that page's address as `back`.

/** The panel that edits a Tasting, and the one that asks before deleting one. */
export const EDIT_PANEL = "edit-tasting";
export const DELETE_PANEL = "delete-tasting";

/**
 * Where to go back to: the address the form carried, when it is a path on this host — and the
 * diary for anything else. `//elsewhere`, `/\elsewhere` and `https:` are not paths here, and an
 * address with whitespace or control characters was not written by this app's own links.
 */
export function backFrom(value: string | null): string {
  if (value === null || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\s\p{Cc}\\]/u.test(value)) return "/";
  return value;
}

/**
 * `back` with its query changed: a value set, `undefined` removed. What the page said before —
 * a panel, a refusal, a sentence — is always dropped first, so an answer never carries the last
 * one along.
 */
export function backWith(back: string, change: Record<string, string | undefined>): string {
  const address = new URL(back, "http://kanpai.invalid");
  for (const stale of ["panel", "tasting", "said", "refused"]) address.searchParams.delete(stale);
  for (const [name, value] of Object.entries(change)) {
    if (value === undefined) address.searchParams.delete(name);
    else address.searchParams.set(name, value);
  }
  return `${address.pathname}${address.search}`;
}

/**
 * What the edit panel says, as `editTasting` takes it. Every field in the panel is written, so
 * an empty one is cleared — the Rating too, with *Not rated*. The day is needed, and a loose
 * Tasting keeps its description: what was drunk is the one thing it has instead of a Label.
 */
export function tastingChangesFrom(form: FormData): TastingFacts & { description?: string } {
  const tastedOn = text(form, "tastedOn");
  if (tastedOn === null) throw new Refusal("invalid", "Choose the day you drank it.");
  const rating = aNumber(form, "rating");
  if (rating === undefined) throw new Refusal("invalid", "Choose a rating from the list.");

  const changes: TastingFacts & { description?: string } = {
    tastedOn,
    rating,
    likedIt: text(form, "likedIt"),
    bodyAndFeel: text(form, "bodyAndFeel"),
    remindedOf: text(form, "remindedOf"),
    food: text(form, "food"),
    place: text(form, "place"),
    company: text(form, "company"),
    notes: text(form, "notes"),
  };
  if (form.has("description")) {
    const description = text(form, "description");
    if (description === null) {
      throw new Refusal("invalid", "Say what you drank. A tasting with no label keeps this.");
    }
    changes.description = description;
  }
  return changes;
}
