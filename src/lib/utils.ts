import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// One class list out of several, with the later word winning where two describe the same
// property — the ordinary shadcn helper, and it is bought rather than written.
//
// tsundoku extends the merger with the type sizes it declared of its own; kanpai declares
// none yet. The day `globals.css` gains a `--text-*` of its own, it is added here too, or
// `cn("text-<it>", "text-muted-foreground")` silently keeps the colour and drops the size.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
