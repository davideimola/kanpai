import Link from "next/link";
import { FIELD, HINT, LOUD, NAMED, PLAIN, QUIET } from "@/components/controls";
import { Drawer, Refused } from "@/components/drawer";
import { ScanABarcode } from "@/components/scan";
import { Silhouette } from "@/components/silhouette";
import {
  type CatalogueAnswer,
  type CatalogueCandidate,
  searchCatalogue,
} from "@/core/queries/catalogue";
import { type HeldVintage, heldInTheCellar } from "@/core/queries/cellar";
import { type KeptKind, listEveryKind } from "@/core/queries/kind";
import type { FoundLabel } from "@/core/queries/label";
import { isRefusal } from "@/core/refusal";
import { SOURCE_TITLE } from "@/core/sources/candidate";
import { configuredSources } from "@/core/sources/configured";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { at } from "../form";
import { counted, heldInWords } from "../words";
import { choose, writeIn } from "./actions";
import { chosenAsParam, chosenFrom, sourceSays, whatWasTyped } from "./search";

// ADD (spec §4, S6): a bottle in the owner's hand — at the shop, at the table — found and recorded
// without opening a chat.
//
// One field takes a name, a producer, the words the phone's own text scan read off the label, or
// a barcode; the camera is the one script on the page (`@/components/scan`) and only fills that
// field in. The search is the address (`?q=`), rendered on the server like every screen here, so
// it works with nothing running in the browser.
//
// The answer comes in the order `searchCatalogue` asks it (ADR-0004, ADR-0011): **our Labels
// first** — *Already yours*, with what the Cellar holds of each — then **each Source's
// candidates**, every one a proposal the owner chooses or not. A candidate shows its photo small
// and whole, because here, and only here, the photo is what tells two bottles apart (ADR-0012).
// A Source that is off or did not answer says so in a line; it never makes this an error page.
//
// Choosing a candidate or writing one in is a panel whose open state is the address
// (`?choose=vivino:1234`, `?panel=write`; `@/components/drawer`), and it ends on the new Label's
// page with Record a tasting, Add bottles or Add to the wishlist open — the Label page's own
// panels (`./actions`).

type Asked = Record<string, string | string[] | undefined>;

function one(asked: Asked, name: string): string | undefined {
  const value = asked[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function AddPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const asked = await searchParams;
  const q = one(asked, "q");
  const refused = one(asked, "refused");
  const chosen = chosenFrom(one(asked, "choose"));
  const writing = one(asked, "panel") === "write";
  const here = at("/add", { q });

  const kinds = await listEveryKind();
  const typed = q ? whatWasTyped(q) : undefined;

  // A Source is asked on an explicit search and nowhere else: the address carries one here.
  let answer: CatalogueAnswer | undefined;
  let notASearch: string | undefined;
  if (typed) {
    try {
      answer = await searchCatalogue(configuredSources(), { ...typed, limit: 8, candidates: 12 });
    } catch (error) {
      if (!isRefusal(error)) throw error;
      notASearch = error.message;
    }
  }
  const held = await heldInTheCellar(answer?.labels.map((label) => label.id) ?? []);
  const candidate = chosen
    ? answer?.candidates.find(
        (one) => one.source === chosen.source && one.idAtSource === chosen.idAtSource
      )
    : undefined;
  const panelOpen = Boolean(chosen) || writing;

  return (
    <main className="flex max-w-3xl flex-col gap-6 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-3.5">
        <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">Add</h1>
        <form action="/add" className="flex flex-wrap gap-2">
          <label
            htmlFor="q"
            className="flex min-h-[50px] min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-rule-field bg-paper-raised px-3.5 text-glass-quiet focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-4-4" />
            </svg>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q ?? ""}
              aria-label="Name, producer or barcode"
              placeholder="Name, producer or barcode"
              enterKeyHint="search"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-glass outline-none placeholder:text-glass-quiet/70"
            />
          </label>
          <ScanABarcode into="q" />
          <button type="submit" className={cn(QUIET, "hidden min-h-[50px] sm:inline-flex")}>
            Search
          </button>
        </form>
      </header>

      {refused && !panelOpen ? <Refused>{refused}</Refused> : null}
      {notASearch ? <Refused>{notASearch}</Refused> : null}

      {!q ? (
        <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
          Search for a bottle by its name, its producer or the barcode on its back. On a phone, the
          keyboard's own text scan reads the label into the field for you.
        </p>
      ) : null}

      {answer && answer.labels.length > 0 ? (
        <section aria-labelledby="yours" className="flex flex-col">
          <h2 id="yours" className="mb-1 font-serif text-xl font-bold">
            Already yours
          </h2>
          <ul>
            {answer.labels.map((label) => (
              <Yours key={label.id} label={label} held={held.get(label.id) ?? []} />
            ))}
          </ul>
        </section>
      ) : null}

      {answer && typed ? <Found answer={answer} typed={typed} kinds={kinds} here={here} /> : null}

      <section className="flex flex-col gap-2.5 rounded-2xl bg-paper-raised p-4">
        <p className="text-[15px] leading-normal">
          {q
            ? "Not here? Write it in yourself: the name and what it is are enough."
            : "Know it already? Write it in yourself: the name and what it is are enough."}
        </p>
        <Link
          href={at("/add", { q, panel: "write" })}
          scroll={false}
          className={cn(QUIET, "self-start")}
        >
          Write it in
        </Link>
      </section>

      {chosen ? (
        <ChoosePanel
          chosen={chosenAsParam(chosen)}
          title={SOURCE_TITLE[chosen.source]}
          candidate={candidate}
          kinds={kinds}
          q={q}
          here={here}
          refused={refused}
        />
      ) : null}
      {writing && !chosen ? (
        <WritePanel
          kinds={kinds}
          q={q}
          name={typed && "query" in typed ? typed.query : undefined}
          here={here}
          refused={refused}
        />
      ) : null}
    </main>
  );
}

/** A Label the owner has: what it is, what the Cellar holds of it, and the two acts on it. */
function Yours({ label, held }: { label: FoundLabel; held: HeldVintage[] }) {
  const page = `/labels/${encodeURIComponent(label.id)}`;
  const what = [label.producer, label.kind.name].filter(Boolean).join(", ");

  return (
    <li className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-3.5 border-t border-rule py-3.5">
      <Silhouette
        shape={label.silhouette.shape}
        liquid={label.silhouette.liquid}
        className="h-[90px] w-[30px]"
      />
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <Link
            href={page}
            className="self-start rounded font-serif text-lg font-bold leading-snug outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label.name}
          </Link>
          <span className="text-sm leading-snug text-glass-quiet">
            {what}. {heldInWords(held)}
            {label.unverified ? " Not checked yet." : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${page}?panel=taste`} className={cn(LOUD, "min-h-11 px-4 text-sm")}>
            Record a tasting
          </Link>
          <Link href={`${page}?panel=bottles`} className={cn(QUIET, "text-sm")}>
            Add bottles
          </Link>
          <Link href={`${page}?panel=wish`} className={cn(PLAIN, "text-sm")}>
            Add to the wishlist
          </Link>
        </div>
      </div>
    </li>
  );
}

/** Each Source's candidates, in the order they were asked, and a line for each that has none. */
function Found({
  answer,
  typed,
  kinds,
  here,
}: {
  answer: CatalogueAnswer;
  typed: { barcode: string } | { query: string };
  kinds: KeptKind[];
  here: string;
}) {
  const quiet = answer.sources
    .map((consulted) => ({ consulted, line: sourceSays(consulted, typed) }))
    .filter((one): one is { consulted: typeof one.consulted; line: string } => one.line !== null);

  return (
    <>
      {answer.sources
        .filter((consulted) => consulted.found > 0)
        .map((consulted) => {
          const title = SOURCE_TITLE[consulted.source];
          return (
            <section
              key={consulted.source}
              aria-labelledby={`on-${consulted.source}`}
              className="flex flex-col"
            >
              <h2 id={`on-${consulted.source}`} className="font-serif text-xl font-bold">
                Found on {title}
              </h2>
              <p className="mt-1 mb-2 text-sm leading-normal text-glass-quiet">
                Check the producer before you choose. Only what you choose is saved.
                {consulted.source === "openfoodfacts"
                  ? " Photos from Open Food Facts, under CC BY-SA."
                  : ""}
              </p>
              <ul>
                {answer.candidates
                  .filter((one) => one.source === consulted.source)
                  .map((one) => (
                    <Candidate key={one.idAtSource} candidate={one} kinds={kinds} here={here} />
                  ))}
              </ul>
            </section>
          );
        })}

      {quiet.length > 0 || answer.discarded > 0 ? (
        <div className="flex flex-col gap-1 text-sm leading-normal text-glass-quiet">
          {quiet.map(({ consulted, line }) => (
            <p key={consulted.source}>{line}</p>
          ))}
          {answer.discarded > 0 ? (
            <p>
              {counted(answer.discarded, "other bottle")} found named another producer, so{" "}
              {answer.discarded === 1 ? "it is" : "they are"} not shown.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** What a candidate says about itself, in one line: producer, where, strength. */
function aboutTheCandidate(candidate: CatalogueCandidate): string {
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
function CandidatePicture({
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

function Candidate({
  candidate,
  kinds,
  here,
}: {
  candidate: CatalogueCandidate;
  kinds: KeptKind[];
  here: string;
}) {
  const about = aboutTheCandidate(candidate);
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
      <div>
        {candidate.label ? (
          <Link
            href={`/labels/${encodeURIComponent(candidate.label)}`}
            className={cn(PLAIN, "text-sm")}
          >
            Already yours
          </Link>
        ) : (
          <Link
            href={`${here}${here.includes("?") ? "&" : "?"}${new URLSearchParams({ choose: chosenAsParam(candidate) })}`}
            scroll={false}
            className={cn(QUIET, "text-sm")}
          >
            Choose
          </Link>
        )}
      </div>
    </li>
  );
}

/** The Kinds a Label can be made as — none hidden — grouped by their section. */
function KindChoice({ kinds, chosen }: { kinds: KeptKind[]; chosen?: string | null }) {
  const offered = kinds.filter((kind) => !kind.hidden);
  const sections = [...new Set(offered.map((kind) => kind.section))];
  const known = offered.some((kind) => kind.id === chosen);
  return (
    <label className={NAMED}>
      What it is
      <select name="kindId" defaultValue={known ? (chosen ?? "") : ""} required className={FIELD}>
        <option value="" disabled>
          Choose…
        </option>
        {sections.map((section) => (
          <optgroup key={section} label={section}>
            {offered
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
  );
}

/** The first Vintage: a year, No year, or unknown when nothing is said (ADR-0010). */
function YearChoice() {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <label className={NAMED}>
        Year
        <span className={HINT}>
          Leave it empty if you do not know it. A spirit, a beer or a sake has none.
        </span>
        <input
          name="year"
          inputMode="numeric"
          pattern="[0-9]{4}"
          placeholder="2019"
          className={cn(FIELD, "max-w-40")}
        />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" name="dating" value="nv" className="size-5 accent-wine-fill" />
        No year: the producer blends years, like most sparkling
      </label>
    </fieldset>
  );
}

/**
 * The three ways on, once the Label exists: the Label page with that act open. The wishlist is
 * for a bottle seen, not yet bought or drunk.
 */
function NextStep() {
  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <p className="text-sm font-medium">Then</p>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="submit" name="next" value="taste" className={LOUD}>
          Record a tasting
        </button>
        <button type="submit" name="next" value="bottles" className={cn(QUIET, "min-h-12")}>
          Add bottles
        </button>
        <button type="submit" name="next" value="wish" className={cn(QUIET, "col-span-2 min-h-12")}>
          Add to the wishlist
        </button>
      </div>
    </div>
  );
}

function ChoosePanel({
  chosen,
  title,
  candidate,
  kinds,
  q,
  here,
  refused,
}: {
  chosen: string;
  title: string;
  candidate?: CatalogueCandidate;
  kinds: KeptKind[];
  q?: string;
  here: string;
  refused?: string;
}) {
  const about = candidate ? aboutTheCandidate(candidate) : "";
  return (
    <Drawer
      title="Is this the one?"
      description={`Say what it is and which year. The rest comes from ${title}, and you can correct it later.`}
      refused={refused}
      closesTo={here}
    >
      <form action={choose} className="flex flex-col gap-4">
        <input type="hidden" name="chosen" value={chosen} />
        {q ? <input type="hidden" name="q" value={q} /> : null}
        {candidate ? (
          <div className="flex items-center gap-4">
            <CandidatePicture candidate={candidate} kinds={kinds} large />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-serif text-xl font-bold leading-snug break-words">
                {candidate.name}
              </span>
              {about ? <span className="text-sm text-glass-quiet">{about}</span> : null}
              <span className="text-[13px] text-glass-quiet">
                From{" "}
                <a
                  href={candidate.pageUrl}
                  rel="noreferrer"
                  target="_blank"
                  className="text-wine underline-offset-4 hover:underline"
                >
                  {title}
                </a>
                {candidate.source === "openfoodfacts" && candidate.imageUrl
                  ? ", photo under CC BY-SA."
                  : "."}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[15px] text-glass-quiet">
            The bottle you chose on {title}. It is read again from {title} when you go on.
          </p>
        )}
        <KindChoice kinds={kinds} chosen={candidate?.kind} />
        <YearChoice />
        <NextStep />
      </form>
    </Drawer>
  );
}

function WritePanel({
  kinds,
  q,
  name,
  here,
  refused,
}: {
  kinds: KeptKind[];
  q?: string;
  name?: string;
  here: string;
  refused?: string;
}) {
  const field = (field: string, title: string, hint?: string, value?: string) => (
    <label className={NAMED}>
      {title}
      {hint ? <span className={HINT}>{hint}</span> : null}
      <input name={field} defaultValue={value ?? ""} className={FIELD} />
    </label>
  );

  return (
    <Drawer
      title="Write it in"
      description="Only the name and what it is are needed. You can add the rest on its page later."
      refused={refused}
      closesTo={here}
    >
      <form action={writeIn} className="flex flex-col gap-4">
        {q ? <input type="hidden" name="q" value={q} /> : null}
        <label className={NAMED}>
          Name
          <input name="name" defaultValue={name ?? ""} required className={FIELD} />
        </label>
        {field("producer", "Producer", "Who made it: the winery, the distillery, the brand.")}
        <KindChoice kinds={kinds} />
        <YearChoice />
        {field("region", "Region")}
        {field("appellation", "Appellation")}
        {field("grapes", "Grapes", "Separated by commas. For a spirit, what it is made from.")}
        {field("strength", "Strength", "Percent alcohol, like 13.5.")}
        <NextStep />
      </form>
    </Drawer>
  );
}
