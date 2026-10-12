import { cn } from "@/lib/utils";

// A RATING, DRAWN: a ring that closes in proportion — a five is a whole ring — with the
// number always written inside it, as text over the drawing (ADR-0003: the Rating is the
// Tasting's, one to five in halves).
//
// The ring is a glance and the number is the answer. A ring on its own asks the owner to judge
// an angle, and a 4 and a 4½ are thirty-six degrees apart; so the number is never left out,
// and it is HTML rather than SVG text so it is set in the page's own face at the page's own
// size. Its colour is the section's — wine, spirit, or the quiet ink for the rest — which is
// how a Tasting's section reads at a glance (docs/brand/README.md).

const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** `4.5` as the owner reads it: `4½`. */
export function ratingAsWritten(rating: number): string {
  const whole = Math.floor(rating);
  return `${whole}${rating - whole >= 0.5 ? "½" : ""}`;
}

/**
 * The tone of a section, by its name. A Kind's section is data (ADR-0002), and the brand gives
 * two of them an accent: *Wine* the wine, *Spirits* the spirit. Every other section — the third
 * one, and any a copy's owner adds or renames — is drawn in the quiet ink, which is a fair
 * reading of *not one of the two*.
 */
export function toneOf(section: string | null | undefined): string {
  if (section === "Wine") return "var(--wine)";
  if (section === "Spirits") return "var(--spirit)";
  return "var(--glass-quiet)";
}

export function RatingRing({
  rating,
  section,
  size = "md",
  className,
}: {
  /** One to five in halves, or `null` for a Tasting nobody rated. */
  rating: number | null;
  section: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tone = toneOf(section);
  const label = rating === null ? "Not rated" : `Rated ${rating} out of 5`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "relative grid shrink-0 place-items-center",
        size === "sm" && "size-10",
        size === "md" && "size-12",
        size === "lg" && "size-14",
        className
      )}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-full" aria-hidden>
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          stroke={tone}
          strokeWidth={3}
          opacity={0.2}
        />
        {rating !== null ? (
          <circle
            cx="24"
            cy="24"
            r={RADIUS}
            fill="none"
            stroke={tone}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${(CIRCUMFERENCE * rating) / 5} ${CIRCUMFERENCE}`}
            transform="rotate(-90 24 24)"
          />
        ) : null}
      </svg>
      <span
        aria-hidden
        className={cn(
          "relative font-serif font-bold leading-none",
          size === "sm" ? "text-sm" : size === "md" ? "text-base" : "text-lg",
          rating === null && "text-glass-quiet"
        )}
      >
        {rating === null ? "–" : ratingAsWritten(rating)}
      </span>
    </span>
  );
}
