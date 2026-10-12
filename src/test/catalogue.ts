import { query } from "@/core/db";
import { createLabel, type NewLabel } from "@/core/verbs/label";

// The catalogue a test starts from: nothing, and a way to put one Label in it.
//
// Every table S1 writes, in one statement, so no test file reads what the one before it left.
// `truncate` fires no row trigger, which is what lets it take finished Bottles with it — the
// one deletion the database otherwise refuses. The Palate is not here: it is one row that is
// never removed, and its own tests empty it by writing.
export async function emptyTheCatalogue(): Promise<void> {
  await query("truncate wishes, tastings, bottles, label_sources, vintages, labels");
}

/** A Label, created the way the doors create one, with its first Vintage. */
export async function aLabel(
  overrides: Partial<NewLabel> = {}
): Promise<{ labelId: string; vintageId: string }> {
  return createLabel({
    producer: "Vietti",
    name: "Barolo Castiglione",
    kindId: "kind_red",
    region: "Piemonte",
    appellation: "Barolo",
    grapes: ["Nebbiolo"],
    unverified: false,
    vintage: 2019,
    ...overrides,
  });
}
