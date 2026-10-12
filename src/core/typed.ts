import "server-only";

// What the owner (or an assistant) typed, on its way to a column.
//
// Two things every verb that writes free text needs, said once. Neither is an invariant —
// the database holds those, and refuses a blank name or a padded region whatever arrives —
// they are the courtesy of not refusing `" Barolo "` for a space nobody meant.

/**
 * Text as stored: trimmed, and `null` where nothing was said.
 *
 * `undefined` stays `undefined`, because to an amending verb it means *not touched* and is
 * a different answer from `null`, which means *cleared*.
 */
export function said<T extends string | null | undefined>(value: T): T | null {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return (trimmed === "" ? null : trimmed) as T | null;
}

/**
 * The `set` list of an amending `update`, from the fields a caller actually passed.
 *
 * `columns` maps each field the verb accepts to its column, so nothing the caller sends is
 * ever interpolated: a key not in the map is not a column, and every value is a parameter
 * numbered after `firstParameter`. A field left `undefined` is left alone.
 */
export function changing<Field extends string>(
  changes: Partial<Record<Field, unknown>>,
  columns: Record<Field, string>,
  firstParameter: number
): { set: string[]; values: unknown[] } {
  const set: string[] = [];
  const values: unknown[] = [];

  for (const field of Object.keys(columns) as Field[]) {
    const value = changes[field];
    if (value === undefined) continue;
    values.push(value);
    set.push(`${columns[field]} = $${firstParameter + values.length - 1}`);
  }

  return { set, values };
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether a string is a day as both doors write it — `2026-10-12` — and a real one. Checked
 * here so that `2026-02-30` is the owner's typo and not the driver's cast error.
 */
export function isADay(value: string): boolean {
  const match = DAY.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const PRICE = /^\d{1,8}([.,]\d{1,2})?$/;

/**
 * A price as the owner typed it — `24.50` or `24,50` — as the column takes it, or
 * `undefined` when it is not one. Nothing typed is `null`.
 */
export function asPrice(value: string | null | undefined): string | null | undefined {
  const typed = said(value);
  if (typed === null || typed === undefined) return null;
  return PRICE.test(typed) ? typed.replace(",", ".") : undefined;
}
