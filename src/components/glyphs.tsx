import { cn } from "@/lib/utils";

// THE NAVIGATION'S MARKS, one per destination, keyed by its route — tsundoku's registry, so the
// map in `src/app/(owner)/navigation.ts` stays data and a destination without a drawing is a
// failing test (`src/app/(owner)/shell.test.ts`) rather than a tab with a hole in it.
//
// Line drawings on a 24-pixel grid, at the weight of the type beside them. A destination added
// to the map draws its glyph here, or the wall fails.

const GLYPHS: Record<string, string> = {
  "/": "M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5Z M12 6v13.5",
  "/cellar": "M7 3h3v4c2 1 2 2 2 3v10H5V10c0-1 0-2 2-3Z M15 6h3v3c2 1 2 2 2 3v8h-7v-8c0-1 0-2 2-3Z",
  "/add": "M12 5v14M5 12h14",
  "/wishlist": "M7 4h10v16l-5-3.5L7 20Z",
  "/palate": "M8 3h8c0 5-1 8-4 8s-4-3-4-8Z M12 11v8 M8.5 20h7",
  "/to-check": "M5 12.5l4.5 4.5L19 7.5",
  "/settings": "M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4",
};

/** Whether a route has a drawing — for the wall, which reads this rather than the markup. */
export function isDrawn(href: string): boolean {
  return href in GLYPHS;
}

export function GlyphFor({ href, className }: { href: string; className?: string }) {
  const path = GLYPHS[href];
  if (!path) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
