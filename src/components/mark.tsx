import { useId } from "react";

import { cn } from "@/lib/utils";

// THE MARK, inline: two glass rings, wine and spirit, linked (docs/brand/README.md). The solid
// drawing, because the chrome shows it small; the numbers are `src/app/icon.svg`'s and
// `docs/brand/mark.svg`'s, copied as the brand README says they are everywhere. The colours are
// the mark's own tokens, so it follows the room's light like everything else on the page.

export function Mark({ className }: { className?: string }) {
  const over = `over-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <clipPath id={over}>
          <rect x="0" y="0" width="64" height="30" />
        </clipPath>
      </defs>
      <g transform="translate(0 1)" fillRule="evenodd">
        <path
          fill="var(--mark-spirit)"
          d="M41 21a18 18 0 1 0 0.01 0Z M39.6 25a13.4 13.4 0 1 0 0.01 0Z"
        />
        <path
          fill="var(--mark-wine)"
          d="M24 5a19 19 0 1 0 0.01 0Z M25.5 10.4a13.2 13.2 0 1 0 0.01 0Z"
        />
        <path
          fill="var(--mark-spirit)"
          clipPath={`url(#${over})`}
          d="M41 21a18 18 0 1 0 0.01 0Z M39.6 25a13.4 13.4 0 1 0 0.01 0Z"
        />
      </g>
    </svg>
  );
}
