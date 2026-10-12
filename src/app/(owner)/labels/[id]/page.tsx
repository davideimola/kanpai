import Link from "next/link";
import { notFound } from "next/navigation";
import { DANGER, FIELD, HINT, LOUD, NAMED, PLAIN, QUIET } from "@/components/controls";
import { Drawer, Refused, Said } from "@/components/drawer";
import { RatingRing, ratingAsWritten } from "@/components/rating-ring";
import { Silhouette } from "@/components/silhouette";
import { listEveryKind } from "@/core/queries/kind";
import {
  getLabel,
  type LabelBottle,
  type LabelPage,
  type LabelTasting,
  type LabelVintage,
  searchLabels,
} from "@/core/queries/label";
import { BOTTLE_SHAPES } from "@/core/verbs/kind";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { theOccasion } from "../../diary";
import {
  bottlesInWords,
  dateAsWritten,
  dayAsWritten,
  levelAsWritten,
  tastedTimes,
  todayAsADay,
  vintageAsWritten,
} from "../../words";
import {
  addSomeBottles,
  amend,
  finish,
  markChecked,
  merge,
  open,
  recordATasting,
  remove,
  setLevel,
  setYear,
} from "./actions";

// ONE LABEL (spec §4): what it is, its Vintages and their Bottles, its Tastings, where it was
// found — and every correction the owner makes to what the assistant wrote (ADR-0004).
//
// The bottle is the hero, drawn from its Kind (ADR-0012). A photograph, when the Label has one,
// is not drawn into it: it sits small beside the credit, opening the whole photograph credited to
// its Source.
//
// Every act that needs fields is a panel whose open state is the address (`?panel=edit`,
// `merge`, `taste`, `bottles`, `photo`; `@/components/drawer`). The Bottle acts — open, set the
// level, finish, delete — are plain forms beside each Bottle, because each is one press.

type Asked = Record<string, string | string[] | undefined>;

function one(asked: Asked, name: string): string | undefined {
  const value = asked[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

const SAID: Record<string, string> = {
  amended: "Saved.",
  checked: "Marked as checked. It is off the to-check list.",
  merged: "Merged. Everything from the other Label is on this one now.",
  tasted: "The Tasting is recorded.",
  added: "The bottles are in the Cellar.",
  opened: "Opened.",
  level: "The level is set.",
  finished: "Finished. The bottle stays here as history.",
  deleted: "The bottle is deleted.",
  dated: "The year is set, and what had no year moved to it.",
};

const PANELS = ["edit", "merge", "taste", "bottles", "photo"] as const;

const SHAPE_NAMES: Record<string, string> = {
  bordeaux: "Bordeaux",
  burgundy: "Burgundy",
  flute: "Flute",
  spirit: "Spirit bottle",
  sake: "Sake bottle",
  beer: "Beer bottle",
};

const SOURCE_NAMES: Record<string, string> = {
  openfoodfacts: "Open Food Facts",
  vivino: "Vivino",
};

export default async function LabelScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Asked>;
}) {
  await requireOwner();

  const [{ id }, asked] = await Promise.all([params, searchParams]);
  const label = await getLabel(decodeURIComponent(id));
  if (!label) notFound();

  const panel = PANELS.find((name) => name === one(asked, "panel"));
  const refused = one(asked, "refused");
  const said = SAID[one(asked, "said") ?? ""];
  const here = `/labels/${encodeURIComponent(label.id)}`;
  const today = todayAsADay();

  const tastings = label.vintages
    .flatMap((vintage) => vintage.tastings.map((tasting) => ({ tasting, vintage })))
    .sort((a, b) => b.tasting.tastedOn.localeCompare(a.tasting.tastedOn));
  const imageUrl = label.silhouette.imageUrl;
  const imageSource = label.sources.find((source) => source.imageUrl === imageUrl);

  return (
    <main className="flex max-w-6xl flex-col gap-6 px-4 pt-3 pb-10 sm:px-6 md:px-10 md:pt-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/cellar" className={cn(PLAIN, "-ml-3 text-glass-quiet")}>
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Cellar
        </Link>
        <div className="flex gap-1.5">
          <Link
            href={`${here}?panel=merge`}
            scroll={false}
            className={cn(PLAIN, "hidden sm:inline-flex")}
          >
            Merge with another Label
          </Link>
          <Link href={`${here}?panel=edit`} scroll={false} className={QUIET}>
            Edit
          </Link>
        </div>
      </div>

      {refused && !panel ? <Refused>{refused}</Refused> : null}
      {said && !refused ? <Said>{said}</Said> : null}

      {label.unverified ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-paper-raised p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px] leading-normal">
            The assistant added this Label and you have not checked it yet. Look over what it wrote,
            edit what is wrong, or merge it into a Label you already have.
          </p>
          <form action={markChecked} className="shrink-0">
            <input type="hidden" name="labelId" value={label.id} />
            <button type="submit" className={QUIET}>
              Mark as checked
            </button>
          </form>
        </section>
      ) : null}

      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        {/* The bottle. */}
        <div className="flex flex-col gap-3 md:w-80 md:shrink-0">
          <div className="grid grid-cols-[104px_minmax(0,1fr)] items-end gap-5 md:block">
            <Hero label={label} />
            <div className="flex flex-col gap-1.5 pb-1.5 md:hidden">
              <Identity label={label} tastings={tastings.length} />
            </div>
          </div>
          <SourceCredit label={label} today={today} here={here} className="hidden md:flex" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-7">
          <header className="hidden flex-wrap items-end justify-between gap-5 md:flex">
            <Identity label={label} tastings={tastings.length} large />
          </header>

          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
            <Link href={`${here}?panel=taste`} scroll={false} className={LOUD}>
              Record a tasting
            </Link>
            <Link href={`${here}?panel=bottles`} scroll={false} className={cn(QUIET, "min-h-12")}>
              Add bottles
            </Link>
          </div>

          <Facts label={label} />

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2 xl:gap-10">
            <section aria-labelledby="vintages" className="flex flex-col">
              <h2 id="vintages" className="mb-1.5 font-serif text-[22px] font-bold">
                Vintages
              </h2>
              {label.vintages.map((vintage) => (
                <Vintage key={vintage.id} label={label} vintage={vintage} />
              ))}
            </section>

            <section aria-labelledby="tastings" className="flex flex-col">
              <h2 id="tastings" className="mb-1.5 font-serif text-[22px] font-bold">
                Tastings
              </h2>
              {tastings.length === 0 ? (
                <p className="border-t border-rule py-4 text-[15px] text-glass-quiet">
                  Not tasted yet. Record a tasting when you open one, or tell the assistant.
                </p>
              ) : (
                tastings.map(({ tasting, vintage }) => (
                  <Tasting key={tasting.id} tasting={tasting} vintage={vintage} today={today} />
                ))
              )}
            </section>
          </div>

          <section className="flex flex-col gap-2 rounded-2xl bg-paper-raised p-4 md:hidden">
            <SourceCredit label={label} today={today} here={here} />
            <Link
              href={`${here}?panel=merge`}
              scroll={false}
              className={cn(PLAIN, "-ml-3 self-start")}
            >
              Merge with another Label
            </Link>
          </section>
        </div>
      </div>

      {panel === "edit" ? (
        <EditPanel label={label} here={here} refused={refused} kinds={await kindsFor(label)} />
      ) : null}
      {panel === "merge" ? (
        <MergePanel label={label} here={here} refused={refused} q={one(asked, "q")} />
      ) : null}
      {panel === "taste" ? (
        <TastePanel label={label} here={here} refused={refused} today={today} />
      ) : null}
      {panel === "bottles" ? <BottlesPanel label={label} here={here} refused={refused} /> : null}
      {panel === "photo" && imageUrl ? (
        <Drawer title="The photo" closesTo={here}>
          <div className="flex flex-col gap-4">
            {/* biome-ignore lint/performance/noImgElement: hotlinked, never ours to resize (ADR-0011) */}
            <img
              src={imageUrl}
              alt={`The bottle of ${label.name}, as ${imageSource ? SOURCE_NAMES[imageSource.source] : "you added it"} shows it`}
              referrerPolicy="no-referrer"
              className="mx-auto max-h-[60dvh] w-auto rounded-xl bg-paper-raised object-contain"
            />
            {imageSource ? (
              <p className="text-sm leading-normal text-glass-quiet">
                Image from{" "}
                {imageSource.pageUrl ? (
                  <a
                    href={imageSource.pageUrl}
                    className="text-wine underline-offset-4 hover:underline"
                    rel="noreferrer"
                    target="_blank"
                  >
                    {SOURCE_NAMES[imageSource.source]}
                  </a>
                ) : (
                  SOURCE_NAMES[imageSource.source]
                )}
                {imageSource.source === "openfoodfacts" ? ", under CC BY-SA." : "."}
              </p>
            ) : (
              <p className="text-sm text-glass-quiet">Your own photo.</p>
            )}
          </div>
        </Drawer>
      ) : null}
    </main>
  );
}

/** The Kinds the edit panel offers: every one not hidden, and the Label's own even if it is. */
async function kindsFor(label: LabelPage) {
  return (await listEveryKind()).filter((kind) => !kind.hidden || kind.id === label.kind.id);
}

function Hero({ label }: { label: LabelPage }) {
  return (
    <div className="flex h-[300px] items-end justify-center rounded-[20px] bg-paper-quiet pb-3.5 md:h-[480px] md:rounded-3xl md:pb-7">
      <Silhouette
        shape={label.silhouette.shape}
        liquid={label.silhouette.liquid}
        title={`A ${SHAPE_NAMES[label.silhouette.shape]?.toLowerCase() ?? "bottle"} of ${label.name}`}
        className="h-[252px] w-[84px] md:h-[400px] md:w-[133px]"
      />
    </div>
  );
}

function Identity({
  label,
  tastings,
  large,
}: {
  label: LabelPage;
  tastings: number;
  large?: boolean;
}) {
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13px] text-glass-quiet md:text-sm">{label.kind.name}</span>
        <h1
          className={
            large
              ? "font-serif text-5xl font-bold leading-[1.05] text-balance"
              : "font-serif text-[30px] font-bold leading-[1.1] text-balance break-words"
          }
        >
          {label.name}
        </h1>
        {label.producer ? (
          <span
            className={
              large ? "font-serif text-[22px] font-medium" : "font-serif text-[19px] font-medium"
            }
          >
            {label.producer}
          </span>
        ) : null}
      </div>
      <div className={large ? "flex items-center gap-3.5" : "mt-3 flex items-center gap-3"}>
        <RatingRing rating={label.score.latest} section={label.kind.section} size="lg" />
        <span className="text-[13px] leading-snug text-glass-quiet md:text-sm">
          {label.score.latest === null ? "Not rated yet." : "Your last rating."}
          <br />
          {tastedTimes(tastings)}.
        </span>
      </div>
    </>
  );
}

function Facts({ label }: { label: LabelPage }) {
  const where = [label.region, label.country].filter(Boolean).join(", ");
  const facts: [string, string | null][] = [
    ["Where", where || null],
    ["Appellation", label.appellation],
    ["Grapes", label.grapes.length > 0 ? label.grapes.join(", ") : null],
    ["Age", label.ageStatement],
    ["Strength", label.strength === null ? null : `${label.strength}%`],
  ];
  const shown = facts.filter((fact): fact is [string, string] => fact[1] !== null);
  if (shown.length === 0) return null;

  return (
    <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-5 gap-y-3 border-y border-rule py-5 text-[15px] leading-normal md:grid-cols-[120px_minmax(0,1fr)] md:gap-x-6">
      {shown.map(([name, value]) => (
        <div key={name} className="contents">
          <dt className="text-glass-quiet">{name}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One Vintage: its year, its Bottles drawn small and in a sentence, its last rating — and the
 * Bottles themselves behind a disclosure, each with what can be done to it. */
function Vintage({ label, vintage }: { label: LabelPage; vintage: LabelVintage }) {
  const inTheHouse = vintage.bottles.filter((bottle) => bottle.state !== "finished");
  const finished = vintage.bottles.length - inTheHouse.length;

  return (
    <div className="border-t border-rule py-3.5">
      <div className="grid grid-cols-[72px_minmax(0,1fr)_40px] items-center gap-3.5">
        <span className="font-serif text-[22px] font-bold leading-tight">
          {vintageAsWritten(vintage)}
        </span>
        <div className="flex min-w-0 items-center gap-2.5">
          {inTheHouse.length > 0 ? (
            <span className="flex shrink-0 items-end gap-[3px]">
              {inTheHouse.slice(0, 6).map((bottle) => (
                <Silhouette
                  key={bottle.id}
                  shape={label.silhouette.shape}
                  liquid={label.silhouette.liquid}
                  level={bottle.state === "open" ? bottle.level : null}
                  className="h-[42px] w-3.5"
                />
              ))}
            </span>
          ) : null}
          <span className="text-sm leading-snug text-glass-quiet">
            {bottlesInWords(vintage.bottles)}
          </span>
        </div>
        <RatingRing rating={vintage.score.latest} section={label.kind.section} size="sm" />
      </div>

      {vintage.bottles.length > 0 ? (
        <details className="group mt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-xl text-sm font-medium text-glass-quiet outline-none hover:text-glass focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <svg
              viewBox="0 0 24 24"
              className="size-4 transition-transform group-open:rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            The bottles{finished > 0 ? `, and ${finished} finished` : ""}
          </summary>
          <ul className="flex flex-col">
            {vintage.bottles.map((bottle, index) => (
              <Bottle key={bottle.id} label={label} bottle={bottle} index={index + 1} />
            ))}
          </ul>
        </details>
      ) : null}

      {vintage.dating === "unknown" ? (
        <form action={setYear} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="labelId" value={label.id} />
          <label className={cn(NAMED, "flex-1")}>
            Learned the year?
            <span className={HINT}>Everything without a year moves to it.</span>
            <input
              name="year"
              inputMode="numeric"
              pattern="[0-9]{4}"
              placeholder="2019"
              className={cn(FIELD, "max-w-40")}
            />
          </label>
          <button type="submit" className={QUIET}>
            Set the year
          </button>
        </form>
      ) : null}
    </div>
  );
}

const LEVEL_CHOICES = [
  ["full", "Full"],
  ["3/4", "¾ left"],
  ["1/2", "½ left"],
  ["1/4", "¼ left"],
] as const;

/** One Bottle, and what can be done to it in its State. A finished one is history: no acts. */
function Bottle({
  label,
  bottle,
  index,
}: {
  label: LabelPage;
  bottle: LabelBottle;
  index: number;
}) {
  const state =
    bottle.state === "open" && bottle.level
      ? `Open, ${levelAsWritten(bottle.level)}`
      : bottle.state === "closed"
        ? "Closed"
        : "Finished";
  const bought = [bottle.boughtOn, bottle.boughtWhere, bottle.price].filter(Boolean).join(", ");

  return (
    <li className="flex flex-col gap-2 border-t border-rule/70 py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium">
          Bottle {index}:{" "}
          <span className={bottle.state === "open" ? "text-wine" : undefined}>{state}</span>
        </span>
        {bought ? <span className="text-[13px] text-glass-quiet">Bought {bought}</span> : null}
      </div>
      {bottle.state === "finished" ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <form
            action={bottle.state === "closed" ? open : setLevel}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="labelId" value={label.id} />
            <input type="hidden" name="bottleId" value={bottle.id} />
            <select
              name="level"
              defaultValue={bottle.level ?? "full"}
              aria-label="How much is left"
              className={cn(FIELD, "w-auto")}
            >
              {LEVEL_CHOICES.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
            <button type="submit" className={QUIET}>
              {bottle.state === "closed" ? "Open it" : "Set level"}
            </button>
          </form>
          <form action={finish}>
            <input type="hidden" name="labelId" value={label.id} />
            <input type="hidden" name="bottleId" value={bottle.id} />
            <button type="submit" className={QUIET}>
              Finished
            </button>
          </form>
          <form action={remove}>
            <input type="hidden" name="labelId" value={label.id} />
            <input type="hidden" name="bottleId" value={bottle.id} />
            <button type="submit" className={DANGER}>
              Delete
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function Tasting({
  tasting,
  vintage,
  today,
}: {
  tasting: LabelTasting;
  vintage: LabelVintage;
  today: string;
}) {
  const occasion = theOccasion(tasting);
  const answers = [
    ["Liked it?", tasting.likedIt],
    ["Body and feel", tasting.bodyAndFeel],
    ["Reminded of", tasting.remindedOf],
    ["Notes", tasting.notes],
  ].filter((answer): answer is [string, string] => answer[1] !== null);

  return (
    <article className="flex flex-col gap-1.5 border-t border-rule py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-serif text-[15px] font-medium text-glass-quiet">
          {dayAsWritten(tasting.tastedOn, today)}
        </span>
        <span className="text-[13px] text-glass-quiet">
          {vintageAsWritten(vintage)}
          {tasting.rating === null ? ", not rated" : `, rated ${ratingAsWritten(tasting.rating)}`}
        </span>
      </div>
      {answers.length === 1 ? (
        <p className="whitespace-pre-line text-[15px] leading-normal">{answers[0]?.[1]}</p>
      ) : (
        <dl className="flex flex-col gap-1 text-[15px] leading-normal">
          {answers.map(([question, said]) => (
            <div key={question}>
              <dt className="inline text-glass-quiet">{question} </dt>
              <dd className="inline whitespace-pre-line">{said}</dd>
            </div>
          ))}
        </dl>
      )}
      {occasion ? <p className="text-[13px] text-glass-quiet">{occasion}</p> : null}
    </article>
  );
}

/** Where the Label was found, and the credit its Source asks for (ADR-0011). */
function SourceCredit({
  label,
  today,
  here,
  className,
}: {
  label: LabelPage;
  today: string;
  here: string;
  className?: string;
}) {
  // The photo, when there is one, is the credit's own picture: small, whole, and the way to the
  // full-size one — a photograph beside the words saying where it came from, never drawn into the
  // bottle (ADR-0012).
  const imageUrl = label.silhouette.imageUrl;
  const words =
    label.sources.length === 0 ? (
      <p>
        {label.unverified
          ? "Written by the assistant from what it read. No catalogue knows this bottle yet."
          : "Written by hand. No catalogue knows this bottle yet."}
      </p>
    ) : (
      label.sources.map((source) => (
        <p key={source.id}>
          Details{source.imageUrl ? " and photo" : ""} from {SOURCE_NAMES[source.source]}, looked up
          on {dateAsWritten(new Date(source.lookedUpAt), today)}
          {source.source === "openfoodfacts" && source.imageUrl ? ", photo under CC BY-SA" : ""}.{" "}
          {source.pageUrl ? (
            <a
              href={source.pageUrl}
              rel="noreferrer"
              target="_blank"
              className="inline-flex min-h-11 items-center font-medium text-wine underline-offset-4 hover:underline md:min-h-0"
            >
              See it on {SOURCE_NAMES[source.source]}
            </a>
          ) : null}
        </p>
      ))
    );

  return (
    <div
      className={`flex items-start gap-3.5 text-[13px] leading-normal text-glass-quiet ${className ?? ""}`}
    >
      {imageUrl ? (
        <Link
          href={`${here}?panel=photo`}
          scroll={false}
          aria-label="See the whole photo"
          className="flex h-[72px] w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-paper-quiet outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* biome-ignore lint/performance/noImgElement: hotlinked, never ours to resize (ADR-0011) */}
          <img
            src={imageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain p-1"
          />
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-col gap-1">{words}</div>
    </div>
  );
}

/** The fields a Label has, every one written on save — an empty one is cleared. */
function EditPanel({
  label,
  here,
  refused,
  kinds,
}: {
  label: LabelPage;
  here: string;
  refused?: string;
  kinds: { id: string; name: string; section: string; bottleShape: string }[];
}) {
  const sections = [...new Set(kinds.map((kind) => kind.section))];
  const field = (name: string, title: string, value: string | null, hint?: string) => (
    <label className={NAMED}>
      {title}
      {hint ? <span className={HINT}>{hint}</span> : null}
      <input name={name} defaultValue={value ?? ""} className={FIELD} />
    </label>
  );

  return (
    <Drawer
      title="Edit the Label"
      description="Correct what the assistant wrote. An empty field is cleared."
      refused={refused}
      closesTo={here}
    >
      <form action={amend} className="flex flex-col gap-4">
        <input type="hidden" name="labelId" value={label.id} />
        {field("name", "Name", label.name)}
        {field("producer", "Producer", label.producer)}
        <label className={NAMED}>
          Kind
          <select name="kindId" defaultValue={label.kind.id} className={FIELD}>
            {sections.map((section) => (
              <optgroup key={section} label={section}>
                {kinds
                  .filter((kind) => kind.section === section)
                  .map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        {field("country", "Country", label.country)}
        {field("region", "Region", label.region)}
        {field("appellation", "Appellation", label.appellation)}
        {field(
          "grapes",
          "Grapes",
          label.grapes.join(", "),
          "Separated by commas. For a spirit, what it is made from."
        )}
        {field("ageStatement", "Age", label.ageStatement, "As the label says it: 16 years, XO.")}
        {field(
          "strength",
          "Strength",
          label.strength === null ? null : String(label.strength),
          "Percent alcohol, like 13.5."
        )}
        <label className={NAMED}>
          Bottle shape
          <span className={HINT}>
            How it is drawn. Leave it as its Kind's unless the bottle is different.
          </span>
          <select name="bottleShape" defaultValue={label.bottleShape ?? ""} className={FIELD}>
            <option value="">
              As its Kind (
              {SHAPE_NAMES[kinds.find((kind) => kind.id === label.kind.id)?.bottleShape ?? ""] ??
                "its own"}
              )
            </option>
            {BOTTLE_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {SHAPE_NAMES[shape]}
              </option>
            ))}
          </select>
        </label>
        {field(
          "ownImageUrl",
          "Your own photo",
          label.ownImageUrl,
          "A web address. Shown in place of the catalogue's image."
        )}
        <button type="submit" className={cn(LOUD, "mt-2")}>
          Save
        </button>
      </form>
    </Drawer>
  );
}

/** Find the other Label, then choose which one stays. */
async function MergePanel({
  label,
  here,
  refused,
  q,
}: {
  label: LabelPage;
  here: string;
  refused?: string;
  q?: string;
}) {
  const found = q ? (await searchLabels(q, 10)).filter((other) => other.id !== label.id) : [];

  return (
    <Drawer
      title="Merge with another Label"
      description="When two Labels are the same bottle. Everything on the one not kept moves onto the one kept: Vintages, Bottles, Tastings, Wishes and Sources. Vintages of the same year are joined."
      refused={refused}
      closesTo={here}
    >
      <form action={here} className="flex items-end gap-2">
        <input type="hidden" name="panel" value="merge" />
        <label className={cn(NAMED, "flex-1")}>
          Find the other Label
          <input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="A name or a producer"
            className={FIELD}
          />
        </label>
        <button type="submit" className={QUIET}>
          Search
        </button>
      </form>

      {q && found.length === 0 ? (
        <p className="mt-5 text-[15px] text-glass-quiet">
          No other Label matches that. Try fewer words.
        </p>
      ) : null}

      <ul className="mt-5 flex flex-col">
        {found.map((other) => (
          <li key={other.id} className="flex flex-col gap-3 border-t border-rule py-4">
            <div className="flex items-center gap-3">
              <Silhouette
                shape={other.silhouette.shape}
                liquid={other.silhouette.liquid}
                className="h-14 w-5"
              />
              <div className="flex min-w-0 flex-col">
                <span className="font-serif text-lg font-bold leading-snug">{other.name}</span>
                <span className="text-sm text-glass-quiet">
                  {[other.producer, other.kind.name, other.unverified ? "not checked yet" : null]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={merge}>
                <input type="hidden" name="labelId" value={label.id} />
                <input type="hidden" name="q" value={q} />
                <input type="hidden" name="keep" value={label.id} />
                <input type="hidden" name="fold" value={other.id} />
                <button type="submit" className={QUIET}>
                  Keep this page's Label
                </button>
              </form>
              <form action={merge}>
                <input type="hidden" name="labelId" value={label.id} />
                <input type="hidden" name="q" value={q} />
                <input type="hidden" name="keep" value={other.id} />
                <input type="hidden" name="fold" value={label.id} />
                <button type="submit" className={QUIET}>
                  Keep {other.name}
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

/** Which Vintage: one the Label has, or a year typed in. A Kind without years has only NV. */
function VintageChoice({ label }: { label: LabelPage }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">Which year</legend>
      <select
        name="vintage"
        defaultValue={label.vintages[0]?.id}
        className={FIELD}
        aria-label="Vintage"
      >
        {label.vintages.map((vintage) => (
          <option key={vintage.id} value={vintage.id}>
            {vintageAsWritten(vintage)}
          </option>
        ))}
        {label.kind.hasVintages ? <option value="year">Another year…</option> : null}
      </select>
      {label.kind.hasVintages ? (
        <label className={NAMED}>
          <span className={HINT}>Another year, when you chose that above</span>
          <input
            name="year"
            inputMode="numeric"
            pattern="[0-9]{4}"
            placeholder="2019"
            className={FIELD}
          />
        </label>
      ) : null}
    </fieldset>
  );
}

const RATINGS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1];

function TastePanel({
  label,
  here,
  refused,
  today,
}: {
  label: LabelPage;
  here: string;
  refused?: string;
  today: string;
}) {
  const field = (name: string, title: string, hint?: string, long?: boolean) =>
    long ? (
      <label className={NAMED}>
        {title}
        {hint ? <span className={HINT}>{hint}</span> : null}
        <textarea name={name} rows={3} className={cn(FIELD, "py-2.5")} />
      </label>
    ) : (
      <label className={NAMED}>
        {title}
        {hint ? <span className={HINT}>{hint}</span> : null}
        <input name={name} className={FIELD} />
      </label>
    );

  return (
    <Drawer
      title="Record a tasting"
      description={`${label.name}. Only the day is needed; say as much or as little as you like.`}
      refused={refused}
      closesTo={here}
    >
      <form action={recordATasting} className="flex flex-col gap-4">
        <input type="hidden" name="labelId" value={label.id} />
        <VintageChoice label={label} />
        <label className={NAMED}>
          Day
          <input name="tastedOn" type="date" defaultValue={today} className={FIELD} />
        </label>
        <label className={NAMED}>
          Rating
          <select name="rating" defaultValue="" className={FIELD}>
            <option value="">Not rated</option>
            {RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {ratingAsWritten(rating)}
              </option>
            ))}
          </select>
        </label>
        {field("likedIt", "Did you like it?", undefined, true)}
        {field("bodyAndFeel", "Body and feel", "Light or full, smooth or dry in the mouth.", true)}
        {field("remindedOf", "What did it remind you of?", undefined, true)}
        {field("food", "With what food?")}
        {field("place", "Where")}
        {field("company", "With whom")}
        {field("notes", "Anything else", undefined, true)}
        <button type="submit" className={cn(LOUD, "mt-2")}>
          Record the tasting
        </button>
      </form>
    </Drawer>
  );
}

function BottlesPanel({
  label,
  here,
  refused,
}: {
  label: LabelPage;
  here: string;
  refused?: string;
}) {
  return (
    <Drawer
      title="Add bottles"
      description={`${label.name}, into the Cellar, closed.`}
      refused={refused}
      closesTo={here}
    >
      <form action={addSomeBottles} className="flex flex-col gap-4">
        <input type="hidden" name="labelId" value={label.id} />
        <VintageChoice label={label} />
        <label className={NAMED}>
          How many
          <input
            name="count"
            type="number"
            min={1}
            max={99}
            defaultValue={1}
            required
            className={FIELD}
          />
        </label>
        <label className={NAMED}>
          Bought on
          <input name="boughtOn" type="date" className={FIELD} />
        </label>
        <label className={NAMED}>
          Price, each
          <input name="price" inputMode="decimal" placeholder="24.50" className={FIELD} />
        </label>
        <label className={NAMED}>
          Where
          <input
            name="boughtWhere"
            placeholder="The wine shop, the winery, a friend"
            className={FIELD}
          />
        </label>
        <button type="submit" className={cn(LOUD, "mt-2")}>
          Add the bottles
        </button>
      </form>
    </Drawer>
  );
}
