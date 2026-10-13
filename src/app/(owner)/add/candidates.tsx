import { Silhouette } from "@/components/silhouette";
import type { CatalogueCandidate } from "@/core/queries/catalogue";
import type { KeptKind } from "@/core/queries/kind";
import { SOURCE_TITLE } from "@/core/sources/candidate";
import { cn } from "@/lib/utils";

// A SOURCE'S CANDIDATE, AS A ROW: its photo small and whole, its name, and what it says about
// itself — with the one act beside it that the screen showing it offers. `/add` offers *Choose*,
// to make a Label from it; a Label's page offers *This is it*, to link the Label to it. One card,
// so a candidate looks the same wherever the owner is asked to confirm one (ADR-0011).

/** What a candidate says about itself, in one line: producer, where, strength. */
export function aboutTheCandidate(candidate: CatalogueCandidate): string {
  return [
    candidate.producer,
    candidate.region ?? candidate.country,
    candidate.strength === null ? null : `${candidate.strength}%`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The candidate's photo, small and whole in a quiet box — never cropped into a silhouette
 * (ADR-0012) — or, when its Source has none, the bottle its Kind would be drawn as.
 */
export function CandidatePicture({
  candidate,
  kinds,
  large,
}: {
  candidate: CatalogueCandidate;
  kinds: KeptKind[];
  large?: boolean;
}) {
  const kind = kinds.find((one) => one.id === candidate.kind);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-paper-quiet",
        large ? "h-48 w-36 rounded-xl" : "h-[84px] w-16"
      )}
    >
      {candidate.imageUrl ? (
        // biome-ignore lint/performance/noImgElement: hotlinked, never ours to resize (ADR-0011)
        <img
          src={candidate.imageUrl}
          alt={`The bottle, as ${SOURCE_TITLE[candidate.source]} shows it`}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-contain p-1"
        />
      ) : kind ? (
        <Silhouette
          shape={kind.bottleShape}
          liquid={kind.liquid}
          className={large ? "h-40 w-[53px]" : "h-[72px] w-6"}
        />
      ) : null}
    </span>
  );
}

/** One candidate in a list, with `children` — the screen's act on it — at the end of the row. */
export function CandidateRow({
  candidate,
  kinds,
  source,
  children,
}: {
  candidate: CatalogueCandidate;
  kinds: KeptKind[];
  /** Say which Source it is from, for a list that mixes them. */
  source?: boolean;
  children: React.ReactNode;
}) {
  const about = [aboutTheCandidate(candidate), source ? SOURCE_TITLE[candidate.source] : null]
    .filter(Boolean)
    .join(". ");
  return (
    <li className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3.5 border-t border-rule py-3.5">
      <CandidatePicture candidate={candidate} kinds={kinds} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-serif text-[17px] font-bold leading-snug break-words">
          {candidate.name}
        </span>
        {about ? (
          <span className="text-[13.5px] leading-snug text-glass-quiet">{about}</span>
        ) : null}
      </div>
      <div>{children}</div>
    </li>
  );
}
