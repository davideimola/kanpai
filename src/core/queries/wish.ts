import "server-only";

import { query } from "../db.ts";

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
