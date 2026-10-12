// THE CONTROLS' CLASSES, said once: the screens are plain forms posting to Server Functions,
// so a button is a `<button>` and a field an `<input>`, dressed by these. Every one is at
// least 44 pixels tall, carries the house's focus ring, and spends only the tokens.
//
// Strings rather than components, because a submit button inside a server-rendered form needs
// nothing a component would add, and a `<Link>` dressed as a button is still a link.

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const BUTTON = `inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[15px] transition-colors disabled:opacity-50 ${FOCUS}`;

/** The one act a screen is mostly opened for: wine on paper. */
export const LOUD = `${BUTTON} min-h-12 bg-wine-fill px-5 font-bold text-on-wine hover:bg-wine-fill/90`;

/** Every other act: an outline in the field's rule. */
export const QUIET = `${BUTTON} border border-rule-field font-medium text-glass hover:bg-paper-quiet`;

/** An act that only reads as a word: a link, a secondary choice in a row. */
export const PLAIN = `${BUTTON} px-3 font-medium text-glass hover:bg-paper-quiet`;

/** An act that removes something, in the refusal's hue so it is never read as a wine. */
export const DANGER = `${BUTTON} border border-refusal/40 font-medium text-refusal hover:bg-refusal/10`;

/** A text field, a number, a date, a select. */
export const FIELD = `min-h-11 w-full rounded-xl border border-rule-field bg-paper-raised px-3 text-base text-glass placeholder:text-glass-quiet/70 ${FOCUS}`;

/** A field's name, above it. */
export const NAMED = "flex flex-col gap-1.5 text-sm font-medium text-glass";

/** What a field is for, under its name, in the quiet ink. */
export const HINT = "text-[13px] font-normal text-glass-quiet";
