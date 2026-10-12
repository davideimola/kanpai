import { useId } from "react";

import type { Level } from "@/core/verbs/bottle";
import type { BottleShape, Liquid } from "@/core/verbs/kind";
import { cn } from "@/lib/utils";

// THE BOTTLE, DRAWN (ADR-0012). Every Bottle and every Label on the web view is this one
// drawing: a shape out of the Kind's row (or the Label's own), holding the Kind's liquid.
//
// **Closed is filled; open is an outline with the liquid up to its Level.** That is the whole
// grammar, and it is what lets the Cellar be read the way a shelf is: what is untouched, what is
// started, and how much is left, without a word.
//
// Every shape is drawn in the same 40 × 120 box with its base on y = 116, so a row of them
// stands on one line whatever they are, and the shelf under them is a rule. Each knows four
// numbers besides its outline: the inside walls (`left`, `right`) and the shoulder (`top`), which
// a full Level reaches, and the rectangle where a label sits (`label`), which a Source's image is
// cropped into.
//
// A server component with no state. `useId` is the one hook in it, and only for the clip path's
// id, which has to be unique on a page that draws thirty of these.

type Geometry = {
  /** The outline, closed, as one path. */
  outline: string;
  /** The capsule, the cork or the crown, filled with ink. */
  cap: string;
  left: number;
  right: number;
  /** Where the liquid of a full Bottle stops: the shoulder. */
  top: number;
  /** The label: x, y, width, height. */
  label: readonly [number, number, number, number];
};

/**
 * One drawing per shape the database allows (`kinds_bottle_shape_is_known`). A `Record` over
 * the type, so a shape added to the check and to `BOTTLE_SHAPES` without a drawing here is a
 * type error rather than a bottle drawn as nothing.
 */
const SHAPES: Record<BottleShape, Geometry> = {
  bordeaux: {
    outline: "M16 4h8v28c0 6 10 8 10 16v64a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V48c0-8 10-10 10-16Z",
    cap: "M15.5 2h9v15h-9Z",
    left: 6,
    right: 34,
    top: 48,
    label: [9, 70, 22, 26],
  },
  burgundy: {
    outline: "M16 4h8v22c0 14 12 18 12 30v56a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V56c0-12 12-16 12-30Z",
    cap: "M15.5 2h9v15h-9Z",
    left: 4,
    right: 36,
    top: 56,
    label: [7, 76, 26, 24],
  },
  flute: {
    outline: "M17 4h6v26c0 12 13 16 13 28v54a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V58c0-12 13-16 13-28Z",
    cap: "M15.5 2h9v20h-9Z",
    left: 4,
    right: 36,
    top: 58,
    label: [7, 78, 26, 22],
  },
  spirit: {
    outline: "M15 14h10v10c0 4 12 4 12 10v78a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V34c0-6 12-6 12-10Z",
    cap: "M14 5h12v9H14Z",
    left: 3,
    right: 37,
    top: 34,
    label: [7, 56, 26, 36],
  },
  sake: {
    outline: "M17 6h6v30c0 8 9 10 9 18v58a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V54c0-8 9-10 9-18Z",
    cap: "M16.5 2h7v5h-7Z",
    left: 8,
    right: 32,
    top: 54,
    label: [11, 70, 18, 30],
  },
  // Shorter than the wine bottles on purpose: a beer stands lower on the same shelf.
  beer: {
    outline: "M17 32h6v18c0 6 9 8 9 14v48a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V64c0-6 9-8 9-14Z",
    cap: "M16 28h8v5h-8Z",
    left: 8,
    right: 32,
    top: 64,
    label: [11, 76, 18, 26],
  },
};

/** How far up the body a Level reaches, as a fraction of a full Bottle. */
const FILLED: Record<Level, number> = { full: 1, "3/4": 0.75, "1/2": 0.5, "1/4": 0.25 };

/** Each liquid's token (`src/app/globals.css`): a colour is named there and nowhere else. */
const LIQUID: Record<Liquid, string> = {
  red: "var(--liquid-red)",
  white: "var(--liquid-white)",
  rose: "var(--liquid-rose)",
  orange: "var(--liquid-orange)",
  amber: "var(--liquid-amber)",
  clear: "var(--liquid-clear)",
};

const BASE = 116;

/**
 * A bottle: closed (filled) unless it has a Level, in which case it is open and holds that
 * much. With an image, the image is cropped into the label; without, the label is paper.
 *
 * Decorative unless `title` is given — beside a name, a picture of the bottle says nothing a
 * screen reader needs twice.
 */
export function Silhouette({
  shape,
  liquid,
  level = null,
  imageUrl = null,
  title,
  className,
}: {
  shape: BottleShape;
  liquid: Liquid;
  /** An open Bottle's Level; `null` for a closed one, or for a Label drawn as itself. */
  level?: Level | null;
  imageUrl?: string | null;
  title?: string;
  className?: string;
}) {
  const clip = `label-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const g = SHAPES[shape];
  const colour = LIQUID[liquid];
  const open = level !== null;
  const [lx, ly, lw, lh] = g.label;

  // The liquid's surface, for an open Bottle: a full one reaches the shoulder.
  const surface = open ? BASE - FILLED[level] * (BASE - g.top) : BASE;

  // The image is laid over a box taller than the label, so the label shows roughly the lower
  // middle of a whole-bottle photograph — which is where the label is on one — and clipped to
  // the rectangle. `slice` covers the box whatever the photograph's proportions.
  const imageHeight = lh / 0.3;
  const imageWidth = lw * 1.4;

  return (
    <svg
      viewBox="0 0 40 120"
      className={cn("overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={g.outline} fill={open ? "var(--paper-raised)" : colour} />
      {open ? (
        <rect
          x={g.left + 1.2}
          y={surface}
          width={g.right - g.left - 2.4}
          height={Math.max(0, BASE - surface - 0.8)}
          rx={3}
          fill={colour}
        />
      ) : null}
      <rect x={lx} y={ly} width={lw} height={lh} rx={1} fill="var(--paper-raised)" />
      {imageUrl ? (
        <>
          <defs>
            <clipPath id={clip}>
              <rect x={lx} y={ly} width={lw} height={lh} rx={1} />
            </clipPath>
          </defs>
          <image
            href={imageUrl}
            x={lx + lw / 2 - imageWidth / 2}
            y={ly - 0.55 * imageHeight}
            width={imageWidth}
            height={imageHeight}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clip})`}
          />
        </>
      ) : null}
      <path
        d={g.outline}
        fill="none"
        stroke="var(--glass)"
        strokeWidth={1.25}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path d={g.cap} fill="var(--glass)" />
    </svg>
  );
}

/**
 * A glass, for a Tasting with no Label (ADR-0005): something was drunk, and no bottle was kept.
 * Drawn in the same box as a bottle, standing on the same line, in outline only.
 */
export function GlassOutline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 120" className={cn("overflow-visible", className)} aria-hidden>
      <path
        d="M9 44h22c0 17-4 28-11 30-7-2-11-13-11-30Z M20 74v40 M12 116h16"
        fill="none"
        stroke="var(--glass-quiet)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
