import { DANGER, FIELD, HINT, LOUD, NAMED, QUIET } from "@/components/controls";
import { Refused, Said } from "@/components/drawer";
import { Silhouette } from "@/components/silhouette";
import { listAccessTokens } from "@/core/queries/access-token";
import { type KeptKind, listEveryKind } from "@/core/queries/kind";
import { listConnectedApps } from "@/core/queries/oauth";
import { BOTTLE_SHAPES, LIQUIDS } from "@/core/verbs/kind";
import { signOutOwner } from "@/lib/auth/actions";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { dateAsWritten, todayAsADay } from "../words";
import {
  addAKind,
  amendAKind,
  deleteAKind,
  disconnect,
  hideAKind,
  moveAKind,
  revoke,
} from "./actions";
import { IssueToken } from "./issue-token";

// SETTINGS (spec §4): who is signed in, the access tokens the assistants connect with
// (ADR-0009), the apps connected over OAuth (ADR-0013), and the Kinds (ADR-0002, ADR-0012).
//
// Every act is a plain form posting to `./actions`, and the answer comes back in the address,
// except a token's secret (`./issue-token`). The Kinds are a list of disclosures: each opens
// onto its own form, so twenty-one Kinds are twenty-one lines until one is being changed.

type Asked = Record<string, string | string[] | undefined>;

const SAID: Record<string, string> = {
  revoked: "Revoked. The assistant using it can no longer reach kanpai.",
  "kind-added": "The Kind is added, last in the list.",
  "kind-saved": "Saved.",
  "kind-moved": "Moved.",
  "kind-hidden": "Hidden. Its Labels keep it; it is no longer offered for new ones.",
  "kind-shown": "Shown again.",
  "kind-deleted": "The Kind is deleted.",
};

const SHAPE_NAMES: Record<string, string> = {
  bordeaux: "Bordeaux",
  burgundy: "Burgundy",
  flute: "Flute",
  spirit: "Spirit bottle",
  sake: "Sake bottle",
  beer: "Beer bottle",
};

const LIQUID_NAMES: Record<string, string> = {
  red: "Red",
  white: "White, straw",
  rose: "Rosé",
  orange: "Orange",
  amber: "Amber",
  clear: "Clear",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Asked> }) {
  const owner = await requireOwner();

  const [tokens, apps, kinds, asked] = await Promise.all([
    listAccessTokens(),
    listConnectedApps(),
    listEveryKind(),
    searchParams,
  ]);
  const today = todayAsADay();
  const refused = typeof asked.refused === "string" ? asked.refused : null;
  const said =
    asked.said === "disconnected" && typeof asked.app === "string"
      ? `Disconnected. ${asked.app} can no longer reach kanpai.`
      : typeof asked.said === "string"
        ? SAID[asked.said]
        : undefined;
  const sections = [...new Set(kinds.map((kind) => kind.section))];

  return (
    <main className="flex max-w-4xl flex-col gap-10 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-4">
        <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">Settings</h1>
        {refused ? <Refused>{refused}</Refused> : null}
        {said && !refused ? <Said>{said}</Said> : null}
      </header>

      <section aria-labelledby="you" className="flex flex-col gap-3">
        <h2 id="you" className="font-serif text-[22px] font-bold">
          You
        </h2>
        {owner.via === "session" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
            <p className="text-[15px]">Signed in as {owner.email}.</p>
            <form action={signOutOwner}>
              <button type="submit" className={QUIET}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <p className="border-t border-rule pt-3 text-[15px] text-glass-quiet">
            The development gate is open, so nobody is signed in and there is nothing to sign out
            of. A copy running in public signs its owner in with Google.
          </p>
        )}
      </section>

      <section
        id="tokens"
        aria-labelledby="tokens-title"
        className="flex scroll-mt-6 flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="tokens-title" className="font-serif text-[22px] font-bold">
            Access tokens
          </h2>
          <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
            An assistant reaches kanpai with a token you issue here. Give each one its own, so you
            can revoke one without the others.
          </p>
        </div>

        <IssueToken />

        {tokens.length === 0 ? null : (
          <ul className="flex flex-col">
            {tokens.map((token) => (
              <li
                key={token.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-rule py-3.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{token.name}</span>
                  <span className="text-[13px] text-glass-quiet">
                    Issued {dateAsWritten(new Date(token.createdAt), today)}
                    {token.lastUsedAt
                      ? `, last used ${dateAsWritten(new Date(token.lastUsedAt), today)}`
                      : ", never used"}
                    {token.revokedAt
                      ? `. Revoked ${dateAsWritten(new Date(token.revokedAt), today)}.`
                      : ""}
                  </span>
                </div>
                {token.revokedAt ? null : (
                  <form action={revoke}>
                    <input type="hidden" name="tokenId" value={token.id} />
                    <button type="submit" className={DANGER}>
                      Revoke
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="apps" aria-labelledby="apps-title" className="flex scroll-mt-6 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="apps-title" className="font-serif text-[22px] font-bold">
            Connected apps
          </h2>
          <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
            Apps like ChatGPT connect by signing in here instead of with a token: you give them this
            copy's address ending in /mcp, and they ask you to allow them. Each stays connected
            until you disconnect it.
          </p>
        </div>

        {apps.length === 0 ? (
          <p className="border-t border-rule pt-3 text-[15px] text-glass-quiet">
            No app is connected.
          </p>
        ) : (
          <ul className="flex flex-col">
            {apps.map((app) => (
              <li
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-rule py-3.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">{app.name}</span>
                  <span className="text-[13px] text-glass-quiet">
                    Connected {dateAsWritten(new Date(app.connectedAt), today)}
                    {app.lastUsedAt
                      ? `, last used ${dateAsWritten(new Date(app.lastUsedAt), today)}`
                      : ", never used"}
                  </span>
                </div>
                <form action={disconnect}>
                  <input type="hidden" name="grantId" value={app.id} />
                  <button type="submit" className={DANGER}>
                    Revoke
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="kinds" aria-labelledby="kinds-title" className="flex scroll-mt-6 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="kinds-title" className="font-serif text-[22px] font-bold">
            Kinds
          </h2>
          <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
            What a Label can be, under the section it is listed in, and how its bottles are drawn. A
            Kind with Labels is never deleted: hide it, and it stops being offered.
          </p>
        </div>

        <datalist id="sections">
          {sections.map((section) => (
            <option key={section} value={section} />
          ))}
        </datalist>

        <ul className="flex flex-col">
          {kinds.map((kind, index) => (
            <li key={kind.id} className="border-t border-rule">
              <KindRow kind={kind} first={index === 0} last={index === kinds.length - 1} />
            </li>
          ))}
        </ul>

        <details className="group rounded-2xl bg-paper-raised">
          <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-[15px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            Add a Kind
          </summary>
          <form action={addAKind} className="flex flex-col gap-4 px-4 pb-4">
            <KindFields />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Does a Label of it have years?</legend>
              <label className="flex min-h-11 items-center gap-3 text-[15px]">
                <input
                  type="radio"
                  name="hasVintages"
                  value="yes"
                  defaultChecked
                  className="size-5 accent-wine-fill"
                />
                Yes, like a wine: each year is its own
              </label>
              <label className="flex min-h-11 items-center gap-3 text-[15px]">
                <input
                  type="radio"
                  name="hasVintages"
                  value="no"
                  className="size-5 accent-wine-fill"
                />
                No, like a spirit or a beer
              </label>
              <span className={HINT}>Said once: it decides what a Label of this Kind can be.</span>
            </fieldset>
            <button type="submit" className={cn(LOUD, "self-start")}>
              Add the Kind
            </button>
          </form>
        </details>
      </section>
    </main>
  );
}

/** The fields a Kind has, empty for a new one or filled for one being changed. */
function KindFields({ kind }: { kind?: KeptKind }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={NAMED}>
        Name
        <input name="name" required defaultValue={kind?.name} className={FIELD} />
      </label>
      <label className={NAMED}>
        Section
        <input
          name="section"
          required
          list="sections"
          defaultValue={kind?.section}
          className={FIELD}
        />
      </label>
      <label className={NAMED}>
        Bottle shape
        <select name="bottleShape" defaultValue={kind?.bottleShape ?? "bordeaux"} className={FIELD}>
          {BOTTLE_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {SHAPE_NAMES[shape]}
            </option>
          ))}
        </select>
      </label>
      <label className={NAMED}>
        What is in it
        <select name="liquid" defaultValue={kind?.liquid ?? "clear"} className={FIELD}>
          {LIQUIDS.map((liquid) => (
            <option key={liquid} value={liquid}>
              {LIQUID_NAMES[liquid]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function KindRow({ kind, first, last }: { kind: KeptKind; first: boolean; last: boolean }) {
  return (
    <details className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Silhouette shape={kind.bottleShape} liquid={kind.liquid} className="h-12 w-4" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={
              kind.hidden ? "text-[15px] font-bold text-glass-quiet" : "text-[15px] font-bold"
            }
          >
            {kind.name}
            {kind.hidden ? <span className="font-normal">, hidden</span> : null}
          </span>
          <span className="text-[13px] text-glass-quiet">
            {kind.section}, {kind.hasVintages ? "has years" : "no years"},{" "}
            {kind.labels === 1 ? "1 Label" : `${kind.labels} Labels`}
          </span>
        </span>
        <span className="text-sm font-medium text-glass-quiet group-open:hidden">Change</span>
        <span className="hidden text-sm font-medium text-glass-quiet group-open:inline">Close</span>
      </summary>

      <div className="flex flex-col gap-4 pb-5 pt-2">
        <form action={amendAKind} className="flex flex-col gap-4">
          <input type="hidden" name="kindId" value={kind.id} />
          <KindFields kind={kind} />
          <button type="submit" className={cn(QUIET, "self-start")}>
            Save
          </button>
        </form>

        <div className="flex flex-wrap gap-2 border-t border-rule/70 pt-4">
          <form action={moveAKind} className="flex gap-2">
            <input type="hidden" name="kindId" value={kind.id} />
            <button
              type="submit"
              name="direction"
              value="earlier"
              disabled={first}
              className={QUIET}
            >
              Move up
            </button>
            <button type="submit" name="direction" value="later" disabled={last} className={QUIET}>
              Move down
            </button>
          </form>
          <form action={hideAKind}>
            <input type="hidden" name="kindId" value={kind.id} />
            <input type="hidden" name="hidden" value={kind.hidden ? "no" : "yes"} />
            <button type="submit" className={QUIET}>
              {kind.hidden ? "Show it again" : "Hide it"}
            </button>
          </form>
          {kind.labels === 0 ? (
            <form action={deleteAKind}>
              <input type="hidden" name="kindId" value={kind.id} />
              <button type="submit" className={DANGER}>
                Delete
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}
