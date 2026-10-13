import Link from "next/link";
import { FIELD, HINT, LOUD, PLAIN, QUIET } from "@/components/controls";
import { Said } from "@/components/drawer";
import { readPalate } from "@/core/queries/palate";
import { whatWasRatedWell } from "@/core/queries/tasting";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { dateAsWritten, todayAsADay } from "../words";
import { save } from "./actions";
import { PalateAsWritten } from "./as-written";
import { ratedWellInWords } from "./rated-well";

// THE PALATE (spec §4, S7): the owner's taste, in prose — **an instruction to the external
// sommelier, not a note to self** (`CONTEXT.md`, **Palate**). The assistant reads it before it
// suggests anything, and proposes changes to it as the Tastings add up; here the owner reads it
// and rewrites it.
//
// Edited in place: the prose drawn as the Markdown it is written in (`./as-written.tsx`), and
// `?edit=1` turns it into the field holding its source. Saving replaces the whole of it, as
// `update_palate` does. An empty Palate opens on the field, with what it is
// for and what to write in it, because the owner is a beginner and a blank box asks too much.
//
// Beside it, quietly, what the diary says was rated well — counted (`whatWasRatedWell`), never
// guessed, and only once there is enough to count.

type Asked = Record<string, string | string[] | undefined>;

const SAID: Record<string, string> = {
  saved: "Saved. The assistant reads this version from now on.",
  emptied: "The Palate is empty now.",
};

const PROMPTS = [
  ["What you have liked, and why", "soft reds with dark fruit, a gin you keep coming back to."],
  ["What you do not enjoy", "too sweet, too much oak, very dry in the mouth, smoke."],
  ["What you are curious about", "a region, a grape, a kind of spirit you have never tried."],
  ["When you drink", "with dinner, with friends, a glass after work, and with what food."],
  ["What you want to spend", "on a bottle for a weeknight, and on one for an occasion."],
  ["How much you know", "just starting, so plain words please; or you read a wine list with ease."],
] as const;

export default async function PalatePage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [palate, well, asked] = await Promise.all([readPalate(), whatWasRatedWell(), searchParams]);
  const today = todayAsADay();
  const empty = palate.prose.trim() === "";
  const editing = empty || asked.edit === "1";
  const said = typeof asked.said === "string" ? SAID[asked.said] : undefined;
  const aside = ratedWellInWords(well);

  return (
    <main className="flex max-w-5xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">Palate</h1>
        <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
          {palate.updatedAt
            ? `Your taste, in your words. Last changed ${dateAsWritten(new Date(palate.updatedAt), today)}.`
            : "Your taste, in your words. Not written yet."}
        </p>
      </header>

      {said ? <Said>{said}</Said> : null}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_17rem] md:gap-10">
        <div className="flex min-w-0 flex-col gap-5">
          {empty ? <WhatItIsFor /> : null}

          {editing ? (
            <form action={save} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-glass">
                {empty ? "Your Palate" : "Rewrite your Palate"}
                <span className={HINT}>
                  Saving replaces the whole text. The assistant reads it before it suggests a
                  bottle.
                </span>
                <textarea
                  name="prose"
                  rows={20}
                  defaultValue={palate.prose}
                  placeholder="I like reds that are soft and fruity, like… I find… I'm curious about…"
                  aria-describedby="palate-markdown"
                  className={cn(
                    FIELD,
                    "min-h-[22rem] py-3 font-mono text-[15px] leading-relaxed md:min-h-[30rem]"
                  )}
                />
                <span id="palate-markdown" className={HINT}>
                  Markdown works: # headings, - lists, **bold**.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={LOUD}>
                  Save the Palate
                </button>
                {empty ? null : (
                  <Link href="/palate" className={PLAIN}>
                    Cancel
                  </Link>
                )}
              </div>
            </form>
          ) : (
            <section aria-label="Your Palate" className="flex flex-col items-start gap-4">
              <div className="w-full rounded-2xl bg-paper-raised px-5 py-5 md:px-8 md:py-7">
                <PalateAsWritten prose={palate.prose} />
              </div>
              <Link href="/palate?edit=1" className={QUIET}>
                Edit
              </Link>
            </section>
          )}
        </div>

        {aside ? (
          <aside
            aria-labelledby="rated-well"
            className="flex flex-col gap-2.5 self-start border-t border-rule pt-4 text-[15px] leading-normal md:border-t-0 md:border-l md:pt-0 md:pl-6"
          >
            <h2 id="rated-well" className="font-serif text-lg font-bold">
              From your diary
            </h2>
            <p className="text-glass-quiet">{aside.heading}</p>
            <dl className="flex flex-col gap-1.5">
              {aside.lines.map((line) => (
                <div key={line.name}>
                  <dt className="text-[13px] text-glass-quiet">{line.name}</dt>
                  <dd>{line.said}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[13px] text-glass-quiet">
              Counted from your Tastings, to help you write. The assistant reads the Palate, not
              this.
            </p>
          </aside>
        ) : null}
      </div>
    </main>
  );
}

/** What a Palate is, for a beginner, and what to write in one. */
function WhatItIsFor() {
  return (
    <section
      aria-labelledby="what"
      className="flex flex-col gap-3 rounded-2xl bg-paper-raised p-4 md:p-5"
    >
      <h2 id="what" className="font-serif text-xl font-bold">
        What is the Palate?
      </h2>
      <p className="max-w-prose text-[15px] leading-relaxed">
        It is your taste, written down for the assistant. When you ask it what to open tonight or
        what to buy, it reads this first and chooses as your sommelier would. You do not need any
        wine words: write it as you would tell a friend who is picking a bottle for you.
      </p>
      <p className="text-[15px] font-medium">A few things worth saying:</p>
      <ul className="flex flex-col gap-1.5 text-[15px] leading-normal">
        {PROMPTS.map(([what, example]) => (
          <li key={what} className="flex gap-2">
            <span aria-hidden className="text-glass-quiet">
              –
            </span>
            <span>
              <span className="font-medium">{what}</span>
              <span className="text-glass-quiet">: {example}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="max-w-prose text-sm leading-relaxed text-glass-quiet">
        A few lines are plenty to start. As your Tastings add up, the assistant may suggest what to
        change, and you can rewrite it here at any time.
      </p>
    </section>
  );
}
