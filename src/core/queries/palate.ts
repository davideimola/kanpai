import "server-only";

import { query } from "../db.ts";

/** The Palate: the owner's taste, in prose, and when it was last written. */
export type Palate = {
  /** Empty until the owner or the assistant writes it. */
  prose: string;
  updatedAt: Date | null;
};

/** Read the Palate (`CONTEXT.md`, **Palate**). There is exactly one. */
export async function readPalate(): Promise<Palate> {
  const [palate] = await query<Palate>(
    `select prose, updated_at as "updatedAt" from palate where id = 'palate'`
  );
  if (!palate) throw new Error("the Palate row is missing; 0007_there_is_one_palate inserts it");
  return palate;
}
