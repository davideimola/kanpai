import Link from "next/link";
import { PLAIN, QUIET } from "@/components/controls";
import { Refused, Said } from "@/components/drawer";
import { Silhouette } from "@/components/silhouette";
import { listUnverifiedLabels } from "@/core/queries/label";
import { requireOwner } from "@/lib/auth/owner";
import { markChecked } from "../labels/[id]/actions";
import { dateAsWritten, todayAsADay } from "../words";

// TO CHECK (spec §4): the Labels the assistant created that the owner has not looked at yet
// (ADR-0004). Nothing here is waiting for approval — a Tasting on an unverified Label is
// recorded in full — so the page is a list of chores, oldest first, each one press away from
// done: open it, edit what is wrong, mark it as checked, or merge it into a Label already kept.
//
// Editing and merging are the Label page's own panels, linked straight into, so there is one
// form for each and the refusals come back beside its fields.

type Asked = Record<string, string | string[] | undefined>;

export default async function ToCheckPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const [labels, asked] = await Promise.all([listUnverifiedLabels(), searchParams]);
  const today = todayAsADay();
  const checked = asked.said === "checked" && typeof asked.name === "string" ? asked.name : null;
  const refused = typeof asked.refused === "string" ? asked.refused : null;

  return (
    <main className="flex max-w-4xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">To check</h1>
        <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
          Labels the assistant added from a photo or a conversation. Nothing waits on them: look
          each one over when you have a minute, fix what it got wrong, and mark it as checked.
        </p>
      </header>

      {refused ? <Refused>{refused}</Refused> : null}
      {checked ? <Said>{checked} is checked.</Said> : null}

      {labels.length === 0 ? (
        <div className="flex flex-col gap-2 border-t border-rule pt-6">
          <p className="font-serif text-xl font-bold">Nothing to check.</p>
          <p className="text-[15px] text-glass-quiet">
            Every Label has been looked at. New ones appear here when the assistant adds them.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {labels.map((label) => {
            const page = `/labels/${encodeURIComponent(label.id)}`;
            return (
              <li
                key={label.id}
                className="flex flex-col gap-3 border-t border-rule py-4 sm:flex-row sm:items-center"
              >
                <Link
                  href={page}
                  className="flex min-w-0 flex-1 items-center gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Silhouette
                    shape={label.silhouette.shape}
                    liquid={label.silhouette.liquid}
                    imageUrl={label.silhouette.imageUrl}
                    className="h-[72px] w-6"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-serif text-lg font-bold leading-snug">{label.name}</span>
                    <span className="text-sm text-glass-quiet">
                      {[label.producer, label.kind.name, label.appellation ?? label.region]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                    <span className="text-[13px] text-glass-quiet">
                      Added {dateAsWritten(new Date(label.createdAt), today)}
                    </span>
                  </span>
                </Link>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  <Link href={`${page}?panel=edit`} className={PLAIN}>
                    Edit
                  </Link>
                  <Link href={`${page}?panel=merge`} className={PLAIN}>
                    Merge
                  </Link>
                  <form action={markChecked}>
                    <input type="hidden" name="labelId" value={label.id} />
                    <input type="hidden" name="name" value={label.name} />
                    <input type="hidden" name="from" value="to-check" />
                    <button type="submit" className={QUIET}>
                      Mark as checked
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
