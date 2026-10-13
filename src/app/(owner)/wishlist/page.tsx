import Link from "next/link";
import { PLAIN, QUIET } from "@/components/controls";
import { Refused, Said } from "@/components/drawer";
import { Silhouette } from "@/components/silhouette";
import { listWishes, type WishInList } from "@/core/queries/wish";
import { requireOwner } from "@/lib/auth/owner";
import { cn } from "@/lib/utils";
import { todayAsADay, vintageAsWritten } from "../words";
import { bought, drop, reopen, tasted } from "./actions";
import { cameFromAsWritten, endedAsWritten, whichWishes } from "./wishlist";

// THE WISHLIST (spec §4, S7): what the owner wants to try or buy, each with why and where the
// idea came from (`CONTEXT.md`, **Wish**). Most arrive from the assistant; the rest from a
// Label's page or from Add.
//
// The open Wishes, newest first, each one press from its ending: **Bought** and **Tasted**
// close it and open the Label page's own panel — Add bottles, Record a tasting — and **Drop**
// closes it here, with an undo. The closed ones are a second list (`?show=closed`), each with
// how it ended, and can be put back.

type Asked = Record<string, string | string[] | undefined>;

function one(asked: Asked, name: string): string | undefined {
  const value = asked[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default async function WishlistPage({ searchParams }: { searchParams: Promise<Asked> }) {
  await requireOwner();

  const asked = await searchParams;
  const which = whichWishes(asked.show);
  const wishes = await listWishes(which);
  const today = todayAsADay();
  const refused = one(asked, "refused");
  const name = one(asked, "name");
  const droppedId = one(asked, "said") === "dropped" ? one(asked, "wish") : undefined;
  const reopened = one(asked, "said") === "reopened";

  return (
    <main className="flex max-w-4xl flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 md:px-10 md:pt-9">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-serif text-[32px] font-bold leading-tight md:text-[40px]">
            Wishlist
          </h1>
          <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
            What you want to try or buy, and why. When you buy one or taste it, say so here and
            record the bottles or the tasting.
          </p>
        </div>
        {/* A Wish is made where a Label is found — Add, then *Add to the wishlist* — so this is a
            way there and a sentence saying which button waits at the end of it. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/add" className={QUIET}>
            Add a wish
          </Link>
          <span className="text-sm text-glass-quiet">
            Find the wine, then choose Add to the wishlist.
          </span>
        </div>
        <nav aria-label="Show">
          <ul className="flex w-max rounded-xl bg-paper-quiet p-[3px]">
            {(
              [
                ["open", "Open", "/wishlist"],
                ["closed", "Closed", "/wishlist?show=closed"],
              ] as const
            ).map(([key, title, href]) => (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={which === key ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-[9px] px-3.5 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    which === key
                      ? "bg-paper-raised font-bold text-glass"
                      : "text-glass-quiet hover:text-glass"
                  )}
                >
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {refused ? <Refused>{refused}</Refused> : null}
      {droppedId ? (
        // What a press did, said where it can be undone: the Wish left the list.
        <Said className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex-1">{name ?? "The Wish"} is dropped from your wishlist.</span>
          <form action={reopen}>
            <input type="hidden" name="wishId" value={droppedId} />
            {name ? <input type="hidden" name="name" value={name} /> : null}
            <button type="submit" className={QUIET}>
              Undo
            </button>
          </form>
        </Said>
      ) : null}
      {reopened ? <Said>{name ?? "The Wish"} is back on your wishlist.</Said> : null}

      {wishes.length === 0 ? (
        which === "open" ? (
          <div className="flex flex-col items-start gap-2 border-t border-rule pt-6">
            <p className="font-serif text-xl font-bold">Nothing on your wishlist.</p>
            <p className="max-w-prose text-[15px] leading-relaxed text-glass-quiet">
              A Wish is a bottle you want to try or buy, kept here until you do. Most arrive from
              the assistant when it suggests something worth trying. You can add one yourself with{" "}
              <span className="font-medium text-glass">Add to the wishlist</span> on a Label's page,
              or after finding the bottle on Add.
            </p>
            <Link href="/add" className={cn(QUIET, "mt-2")}>
              Find a bottle
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-rule pt-6">
            <p className="font-serif text-xl font-bold">Nothing closed yet.</p>
            <p className="text-[15px] text-glass-quiet">
              A Wish you bought, tasted or dropped is kept here, with how it ended.
            </p>
          </div>
        )
      ) : (
        <ul className="flex flex-col">
          {wishes.map((wish) => (
            <Wish key={wish.id} wish={wish} today={today} />
          ))}
        </ul>
      )}
    </main>
  );
}

/** One Wish: the Label drawn and named, why, where it came from, and its acts. */
function Wish({ wish, today }: { wish: WishInList; today: string }) {
  const page = `/labels/${encodeURIComponent(wish.label.id)}`;
  const what = [
    wish.label.producer,
    wish.label.kind.name,
    wish.vintage?.dating === "year" ? vintageAsWritten(wish.vintage) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const hidden = (
    <>
      <input type="hidden" name="wishId" value={wish.id} />
      <input type="hidden" name="name" value={wish.label.name} />
    </>
  );

  return (
    <li className="flex flex-col gap-3 border-t border-rule py-4 sm:flex-row sm:items-center sm:gap-6">
      <Link
        href={page}
        className="flex min-w-0 flex-1 items-start gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Silhouette
          shape={wish.label.silhouette.shape}
          liquid={wish.label.silhouette.liquid}
          className="h-[72px] w-6 shrink-0"
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-serif text-lg font-bold leading-snug break-words">
            {wish.label.name}
          </span>
          {what ? <span className="text-sm text-glass-quiet">{what}</span> : null}
          {wish.why ? (
            <span className="mt-1 text-[15px] leading-normal text-glass">{wish.why}</span>
          ) : null}
          <span className="mt-0.5 text-[13px] text-glass-quiet">
            {cameFromAsWritten(wish.cameFrom, new Date(wish.createdAt), today)}
            {wish.closedAs && wish.closedAt
              ? `. ${endedAsWritten(wish.closedAs, new Date(wish.closedAt), today)}.`
              : ""}
          </span>
        </span>
      </Link>
      {wish.closedAs ? (
        <form action={reopen} className="sm:shrink-0">
          {hidden}
          <button type="submit" className={PLAIN}>
            Put it back on the list
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1.5 pl-10 sm:shrink-0 sm:justify-end sm:pl-0">
          <form action={bought}>
            {hidden}
            <button type="submit" className={QUIET}>
              Bought
            </button>
          </form>
          <form action={tasted}>
            {hidden}
            <button type="submit" className={QUIET}>
              Tasted
            </button>
          </form>
          <form action={drop}>
            {hidden}
            <button type="submit" className={PLAIN}>
              Drop
            </button>
          </form>
        </div>
      )}
    </li>
  );
}
