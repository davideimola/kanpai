import Link from "next/link";
import { DANGER, FIELD, HINT, LOUD, NAMED, PLAIN, QUIET } from "@/components/controls";
import { Drawer } from "@/components/drawer";
import { ratingAsWritten } from "@/components/rating-ring";
import type { LabelTasting } from "@/core/queries/label";
import { cn } from "@/lib/utils";
import { dayAsWritten } from "../words";
import { deleteATasting, editATasting } from "./actions";
import { backWith, DELETE_PANEL, EDIT_PANEL } from "./tastings";

// A TASTING'S FIELDS AND ITS TWO PANELS, said once for every page that shows a Tasting: the
// Label's page records one and edits or deletes the ones under it, and the diary edits or
// deletes a loose one, which has no page of its own (ADR-0005).

/** A Tasting as these panels read it: the fields, and a loose one's description. */
export type TastingShown = LabelTasting & { description?: string | null };

const RATINGS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];

/**
 * The fields a Tasting has, in the order the owner thinks of them: the day and the Rating, the
 * four guided answers, then the occasion and anything else. Empty to record one, filled in to
 * edit one; a loose one's description first, when it is loose.
 */
export function TastingFields({ tasting, today }: { tasting?: TastingShown; today: string }) {
  const field = (
    name: keyof TastingShown & string,
    title: string,
    options: { hint?: string; long?: boolean; placeholder?: string } = {}
  ) => {
    const value = (tasting?.[name] as string | null | undefined) ?? "";
    const hint = options.hint ? <span className={HINT}>{options.hint}</span> : null;
    return options.long ? (
      <label className={NAMED}>
        {title}
        {hint}
        <textarea
          name={name}
          rows={3}
          defaultValue={value}
          placeholder={options.placeholder}
          className={cn(FIELD, "py-2.5")}
        />
      </label>
    ) : (
      <label className={NAMED}>
        {title}
        {hint}
        <input
          name={name}
          defaultValue={value}
          placeholder={options.placeholder}
          className={FIELD}
        />
      </label>
    );
  };

  return (
    <>
      {typeof tasting?.description === "string"
        ? field("description", "What you drank", {
            hint: "As much as you knew: the grape, the region, what the menu said.",
            long: true,
          })
        : null}
      <label className={NAMED}>
        Day
        <input
          name="tastedOn"
          type="date"
          required
          defaultValue={tasting?.tastedOn ?? today}
          className={FIELD}
        />
      </label>
      <label className={NAMED}>
        Rating
        <select
          name="rating"
          defaultValue={tasting?.rating === null || !tasting ? "" : String(tasting.rating)}
          className={FIELD}
        >
          <option value="">Not rated</option>
          {RATINGS.map((rating) => (
            <option key={rating} value={rating}>
              {ratingAsWritten(rating)}
            </option>
          ))}
        </select>
      </label>
      {field("likedIt", "Did you like it?", { long: true })}
      {field("bodyAndFeel", "Body and feel", {
        hint: "Light or full, smooth or dry in the mouth.",
        long: true,
      })}
      {field("remindedOf", "What did it remind you of?", { long: true })}
      {field("food", "With what food?")}
      {field("place", "Where")}
      {field("company", "With whom")}
      {field("notes", "Anything else", { long: true })}
    </>
  );
}

/** Edit and Delete, beside a Tasting: each opens its panel on the page it is pressed on. */
export function TastingActs({
  here,
  tasting,
  className,
}: {
  here: string;
  tasting: string;
  className?: string;
}) {
  return (
    <div className={cn("-ml-3 flex flex-wrap gap-1", className)}>
      <Link
        href={backWith(here, { panel: EDIT_PANEL, tasting })}
        scroll={false}
        className={cn(PLAIN, "text-glass-quiet")}
      >
        Edit
      </Link>
      <Link
        href={backWith(here, { panel: DELETE_PANEL, tasting })}
        scroll={false}
        className={cn(PLAIN, "text-refusal hover:bg-refusal/10")}
      >
        Delete
      </Link>
    </div>
  );
}

/** Correct a Tasting, every field shown as it is. Saving writes them all; an empty one is cleared. */
export function EditTastingPanel({
  tasting,
  about,
  here,
  refused,
  today,
}: {
  tasting: TastingShown;
  /** What was drunk, in a few words: the Label and year, or a loose one's description. */
  about: string;
  here: string;
  refused?: string;
  today: string;
}) {
  return (
    <Drawer
      title="Edit the tasting"
      description={`${about}. Change what you like. An empty field is cleared.`}
      refused={refused}
      closesTo={here}
    >
      <form action={editATasting} className="flex flex-col gap-4">
        <input type="hidden" name="tastingId" value={tasting.id} />
        <input type="hidden" name="back" value={here} />
        <TastingFields tasting={tasting} today={today} />
        <button type="submit" className={cn(LOUD, "mt-2")}>
          Save
        </button>
      </form>
    </Drawer>
  );
}

/**
 * Ask before deleting a Tasting, in the panel rather than a browser dialog: what it is, what
 * deleting does, and the way to change it instead — a Tasting the owner changed their mind
 * about is edited, never deleted.
 */
export function DeleteTastingPanel({
  tasting,
  about,
  here,
  today,
}: {
  tasting: TastingShown;
  about: string;
  here: string;
  today: string;
}) {
  const when = dayAsWritten(tasting.tastedOn, today);
  const rated = tasting.rating === null ? "not rated" : `rated ${ratingAsWritten(tasting.rating)}`;

  return (
    <Drawer
      title="Delete this tasting?"
      description={`${about}, ${when}, ${rated}.`}
      closesTo={here}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-normal">
          Delete a tasting only when it should not be there: recorded by mistake, or recorded twice.
          It is gone for good, and your scores stop counting it.
        </p>
        <p className="text-[15px] leading-normal text-glass-quiet">
          Changed your mind about the wine? Edit the tasting instead, or record a new one next time
          you drink it.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action={deleteATasting}>
            <input type="hidden" name="tastingId" value={tasting.id} />
            <input type="hidden" name="back" value={here} />
            <button type="submit" className={DANGER}>
              Delete the tasting
            </button>
          </form>
          <Link
            href={backWith(here, { panel: EDIT_PANEL, tasting: tasting.id })}
            scroll={false}
            className={QUIET}
          >
            Edit it instead
          </Link>
          <Link href={here} scroll={false} className={PLAIN}>
            Keep it
          </Link>
        </div>
      </div>
    </Drawer>
  );
}
