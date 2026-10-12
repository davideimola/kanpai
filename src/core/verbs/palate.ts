import "server-only";

import { query } from "../db.ts";

/**
 * Write the Palate: the owner's taste, in prose, as an instruction to the external sommelier
 * (`CONTEXT.md`, **Palate**). The whole of it, replacing what was there; an empty string
 * empties it. There is one, so there is nothing to name.
 */
export async function writePalate(prose: string): Promise<void> {
  await query("update palate set prose = $1, updated_at = now() where id = 'palate'", [
    prose.trim(),
  ]);
}
