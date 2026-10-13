import "server-only";

import { query } from "../db.ts";
import type { WishEnding } from "../verbs/wish.ts";
import { SILHOUETTE, type Silhouette } from "./label.ts";

/** An open Wish, with the Label it names — directly or through one of its Vintages. */
export type OpenWish = {
  id: string;
  why: string | null;
  cameFrom: string | null;
  createdAt: Date;
  label: {
    id: string;
    producer: string | null;
    name: string;
    kind: { id: string; name: string };
  };
  /** The Vintage it names, or `null` when it names the Label as a whole. */
  vintage: { id: string; dating: "year" | "nv" | "unknown"; year: number | null } | null;
};

/** The Wishes not yet closed, newest first: the wishlist. */
export async function listOpenWishes(): Promise<OpenWish[]> {
  return query<OpenWish>(
    `select w.id, w.why, w.came_from as "cameFrom", w.created_at as "createdAt",
            json_build_object('id', l.id, 'producer', l.producer, 'name', l.name,
              'kind', json_build_object('id', k.id, 'name', k.name)) as label,
            case when v.id is null then null
                 else json_build_object('id', v.id, 'dating', v.dating, 'year', v.year) end as vintage
       from wishes w
       left join vintages v on v.id = w.vintage_id
       join labels l on l.id = coalesce(w.label_id, v.label_id)
       join kinds k on k.id = l.kind_id
      where w.closed_as is null
      order by w.created_at desc, w.id`
  );
}

/**
 * A Wish as the wishlist page shows it: the open one's fields, the Label drawn (ADR-0012), and
 * — for one that is closed — how it ended and when.
 */
export type WishInList = OpenWish & {
  label: OpenWish["label"] & { silhouette: Silhouette };
  closedAs: WishEnding | null;
  closedAt: Date | null;
};

/**
 * The wishlist, as `/wishlist` reads it: the open Wishes newest first, or the closed ones —
 * bought, tasted, dropped — the most recently closed first.
 */
export async function listWishes(which: "open" | "closed"): Promise<WishInList[]> {
  return query<WishInList>(
    `select w.id, w.why, w.came_from as "cameFrom", w.created_at as "createdAt",
            w.closed_as as "closedAs", w.closed_at as "closedAt",
            json_build_object('id', l.id, 'producer', l.producer, 'name', l.name,
              'kind', json_build_object('id', k.id, 'name', k.name),
              'silhouette', ${SILHOUETTE}) as label,
            case when v.id is null then null
                 else json_build_object('id', v.id, 'dating', v.dating, 'year', v.year) end as vintage
       from wishes w
       left join vintages v on v.id = w.vintage_id
       join labels l on l.id = coalesce(w.label_id, v.label_id)
       join kinds k on k.id = l.kind_id
      where (w.closed_as is null) = ($1 = 'open')
      order by coalesce(w.closed_at, w.created_at) desc, w.id`,
    [which]
  );
}

/** One Wish, open or closed, with the Label it names: what a page says about a Wish it was handed. */
export type WishOf = {
  id: string;
  labelId: string;
  vintageId: string | null;
  closedAs: WishEnding | null;
};

/** One Wish by its id, or `null` when no Wish has it. */
export async function getWish(wishId: string): Promise<WishOf | null> {
  const [wish] = await query<WishOf>(
    `select w.id, coalesce(w.label_id, v.label_id) as "labelId", w.vintage_id as "vintageId",
            w.closed_as as "closedAs"
       from wishes w left join vintages v on v.id = w.vintage_id
      where w.id = $1`,
    [wishId]
  );
  return wish ?? null;
}

/** The open Wish on a Label, as its page says it: since when, and why. */
export type WishOnLabel = {
  id: string;
  why: string | null;
  createdAt: Date;
  vintage: { id: string; dating: "year" | "nv" | "unknown"; year: number | null } | null;
};

/**
 * The open Wish on a Label — naming the Label or one of its Vintages — or `null` when it has
 * none. A Label is wished for once (`addWish` refuses a second), so its page shows this one
 * in place of Add to the wishlist, and the Vivino import skips a wine already wished for.
 */
export async function openWishOn(labelId: string): Promise<WishOnLabel | null> {
  const [wish] = await query<WishOnLabel>(
    `select w.id, w.why, w.created_at as "createdAt",
            case when v.id is null then null
                 else json_build_object('id', v.id, 'dating', v.dating, 'year', v.year) end as vintage
       from wishes w left join vintages v on v.id = w.vintage_id
      where coalesce(w.label_id, v.label_id) = $1 and w.closed_as is null
      order by w.created_at desc, w.id
      limit 1`,
    [labelId]
  );
  return wish ?? null;
}
