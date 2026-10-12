// What a form posted, read the way every Server Function in this group reads it. The adapters
// are thin (`AGENTS.md`): they read fields, call one verb, and say what it said. Reading a field
// is the one thing they all do, so it is said once.

/** A field's text, trimmed, or `null` where the owner left it empty. */
export function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A number the owner typed — `15`, `15.5` or `15,5` — or `null` when nothing was typed, or
 * `undefined` when what was typed is not a number, so the caller can say so.
 */
export function aNumber(form: FormData, field: string): number | null | undefined {
  const typed = text(form, field);
  if (typed === null) return null;
  const value = Number(typed.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

/** A list typed with commas: `Corvina, Rondinella`. */
export function aList(form: FormData, field: string): string[] {
  return (text(form, field) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** An address with its query, from a path and the values that are there. */
export function at(path: string, said: Record<string, string | undefined>): string {
  const query = new URLSearchParams(
    Object.entries(said).filter((entry): entry is [string, string] => entry[1] !== undefined)
  ).toString();
  return query ? `${path}?${query}` : path;
}
