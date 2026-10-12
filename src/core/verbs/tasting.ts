import "server-only";

import { query } from "../db.ts";
import { Refusal, refusing } from "../refusal.ts";
import { changing, isADay, said } from "../typed.ts";

/**
 * What a Tasting says about the occasion and the opinion (`CONTEXT.md`, **Tasting**,
 * **Rating**).
 *
 * `food` is both what it was drunk with and the fourth guided answer; `likedIt`,
 * `bodyAndFeel` and `remindedOf` are the other three, which the assistant writes up from the
 * owner's words.
 */
export type TastingFacts = {
  /** The day, `2026-10-12`. Today when left out. */
  tastedOn?: string;
  place?: string | null;
  food?: string | null;
  company?: string | null;
  /** One to five in half steps, or nothing (ADR-0003). */
  rating?: number | null;
  notes?: string | null;
  likedIt?: string | null;
  bodyAndFeel?: string | null;
  remindedOf?: string | null;
};

/**
 * A Tasting about to be recorded: on a Vintage, **or** loose with a description of what was
 * known — exactly one of the two (ADR-0005).
 */
export type NewTasting = TastingFacts & {
  vintageId?: string | null;
  /** For a loose Tasting: *a Primitivo by the glass*, Kind, grape, region. */
  description?: string | null;
};

const NO_SUCH_TASTING = "No Tasting has that id.";

const COLUMNS: Record<keyof TastingFacts | "description", string> = {
  tastedOn: "tasted_on",
  place: "place",
  food: "food",
  company: "company",
  rating: "rating",
  notes: "notes",
  likedIt: "liked_it",
  bodyAndFeel: "body_and_feel",
  remindedOf: "reminded_of",
  description: "description",
};

function tastingRefusal(constraint: string | undefined): string {
  switch (constraint) {
    case "tastings_vintage_exists":
      return "No Vintage has that id.";
    case "tastings_on_a_vintage_or_described":
      return "A Tasting is on a Vintage, or loose with a description of what was drunk — one of the two.";
    case "tastings_rating_is_one_to_five_in_halves":
      return "A Rating is one to five, in half steps.";
    default:
      return "That Tasting could not be recorded.";
  }
}

function asStored(facts: TastingFacts & { description?: string | null }) {
  if (facts.tastedOn !== undefined && !isADay(facts.tastedOn)) {
    throw new Refusal("invalid", "A day is written 2026-10-12.");
  }
  return {
    tastedOn: facts.tastedOn,
    place: said(facts.place),
    food: said(facts.food),
    company: said(facts.company),
    rating: facts.rating,
    notes: said(facts.notes),
    likedIt: said(facts.likedIt),
    bodyAndFeel: said(facts.bodyAndFeel),
    remindedOf: said(facts.remindedOf),
    description: said(facts.description),
  };
}

/**
 * Record one occasion and what the owner thought of it. Never overwrites another: the same
 * Vintage drunk twice is two Tastings, and the second may disagree with the first.
 */
export async function recordTasting(tasting: NewTasting): Promise<string> {
  const s = asStored(tasting);
  const [row] = await refusing(
    () =>
      query<{ id: string }>(
        `insert into tastings (vintage_id, description, tasted_on, place, food, company, rating,
                               notes, liked_it, body_and_feel, reminded_of)
         values ($1, $2, coalesce($3::date, current_date), $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
        [
          tasting.vintageId ?? null,
          s.description ?? null,
          s.tastedOn ?? null,
          s.place ?? null,
          s.food ?? null,
          s.company ?? null,
          s.rating ?? null,
          s.notes ?? null,
          s.likedIt ?? null,
          s.bodyAndFeel ?? null,
          s.remindedOf ?? null,
        ]
      ),
    tastingRefusal
  );
  if (!row) throw new Error("insert into tastings returned no row");
  return row.id;
}

/**
 * Correct a Tasting that was entered wrong — an edit of that Tasting, never a new one
 * (ADR-0003). Fields left out are left alone; `null` clears one. What it is on is not
 * changed here: attaching a loose one is `attachTasting`, and learning a year is
 * `setVintageYear`.
 */
export async function editTasting(
  tastingId: string,
  changes: TastingFacts & { description?: string | null }
): Promise<void> {
  const { set, values } = changing(asStored(changes), COLUMNS, 2);
  const updated = await refusing(
    () =>
      query(
        `update tastings set ${[...set, "edited_at = now()"].join(", ")} where id = $1 returning id`,
        [tastingId, ...values]
      ),
    tastingRefusal
  );
  if (updated.length === 0) throw new Refusal("not-found", NO_SUCH_TASTING);
}

/**
 * A Label turned up for a loose Tasting: put it on that Vintage (ADR-0005). Its description
 * goes — the Label now says what was drunk — and nothing else about it changes. A Tasting
 * already on a Vintage is refused.
 */
export async function attachTasting(tastingId: string, vintageId: string): Promise<void> {
  const updated = await refusing(
    () =>
      query(
        `update tastings set vintage_id = $2, description = null, edited_at = now()
          where id = $1 and vintage_id is null
          returning id`,
        [tastingId, vintageId]
      ),
    tastingRefusal
  );
  if (updated.length > 0) return;

  const found = await query("select 1 from tastings where id = $1", [tastingId]);
  throw found.length === 0
    ? new Refusal("not-found", NO_SUCH_TASTING)
    : new Refusal("not-allowed", "That Tasting is already on a Vintage.");
}

/**
 * Strike a Tasting that was entered by mistake: it never happened, so it is removed and no
 * score counts it. A Tasting the owner merely changed their mind about is edited, or
 * followed by another, never struck.
 */
export async function strikeTasting(tastingId: string): Promise<void> {
  const removed = await query("delete from tastings where id = $1 returning id", [tastingId]);
  if (removed.length === 0) throw new Refusal("not-found", NO_SUCH_TASTING);
}
