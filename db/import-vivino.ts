import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { requireDatabaseUrl } from "./env.ts";

// The owner's history, brought over from Vivino (spec §5, S8).
//
//   pnpm import:vivino <folder>            say what would be written, and write nothing
//   pnpm import:vivino <folder> --apply    write it
//
// <folder> is Vivino's data export, unzipped: *Settings → Privacy → Download your data*. Three
// of its files are read, and nothing else in it — the profile, the logins and the scan photos
// are the owner's, not the record's:
//
//   full_wine_list.csv   every wine scanned or rated. Each becomes a Label with its Vintage, and
//                        one Tasting on the day it was scanned, with the rating, review and
//                        note if Vivino has them — a scan is how a wine was recorded as drunk
//   cellar.csv           what Vivino's cellar holds: that many closed Bottles of the Vintage
//   wishlisted.csv       a Wish on the Label, or on the Vintage when it names a year — unless
//                        the wine is also in the drunk list, which says it is not wished for
//
// **Re-runnable.** A Label is found by its producer and name before one is made, a Tasting on
// the same Vintage and day is not recorded twice, a Vintage already holding as many Bottles as
// the cellar says gets none, and a Label already wished for gets no second Wish. So a second
// run after a fresh export brings only what is new.
//
// Labels are born checked: what Vivino says of a wine is a catalogue's word, not something
// read off a photo (ADR-0004). They carry no Source record: the export links to a Vintage's
// page (`/wines/<vintage id>`), not to the wine's id that the Vivino Source keys on (ADR-0011),
// so recording it would make a second search of the same wine look like a stranger.

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    return next(specifier, context);
  },
});

type Row = Record<string, string>;

/** RFC 4180, which is what Vivino writes: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...rows] = records.filter((r) => r.some((value) => value.trim() !== ""));
  if (!header) return [];
  return rows.map((r) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), (r[i] ?? "").trim()]))
  );
}

function read(folder: string, file: string): Row[] {
  try {
    return parseCsv(readFileSync(join(folder, file), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Vivino's wine types, as the Kinds a fresh copy has (`0001`, `0010`). */
const KINDS: Record<string, string> = {
  "red wine": "kind_red",
  "white wine": "kind_white",
  "rosé wine": "kind_rose",
  "rose wine": "kind_rose",
  "orange wine": "kind_orange",
  sparkling: "kind_sparkling",
  "dessert wine": "kind_sweet",
  "fortified wine": "kind_fortified",
};

/**
 * The Vintage a row names. A year when there is one; with none, NV for a sparkling wine — most
 * are blended across years — and unknown for anything else, since Vivino leaves the year out
 * when the scan did not read it as well as when there is none (ADR-0010).
 */
function datingOf(row: Row, kindId: string): number | "nv" | "unknown" {
  const year = Number(row.Vintage);
  if (Number.isInteger(year) && year >= 1800 && year <= 2200) return year;
  return kindId === "kind_sparkling" ? "nv" : "unknown";
}

/** Vivino's 1–5 with decimals, as a Rating: the nearest half (ADR-0003). */
function ratingOf(value: string | undefined): number | null {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, Math.max(1, Math.round(n * 2) / 2));
}

function key(row: Row): string {
  return `${row.Winery.toLowerCase()}\u0000${row["Wine name"].toLowerCase()}`;
}

async function main(): Promise<void> {
  const [folder, ...flags] = process.argv.slice(2);
  const apply = flags.includes("--apply");
  if (!folder || flags.some((flag) => flag !== "--apply")) {
    process.stderr.write("usage: node db/import-vivino.ts <export folder> [--apply]\n");
    process.exitCode = 1;
    return;
  }

  const drunk = read(folder, "full_wine_list.csv");
  const cellar = read(folder, "cellar.csv");
  const wished = read(folder, "wishlisted.csv");
  if (drunk.length + cellar.length + wished.length === 0) {
    process.stderr.write(`nothing to import: no Vivino CSV files in ${folder}\n`);
    process.exitCode = 1;
    return;
  }

  // One Label per producer and name, whichever files name it.
  const labels = new Map<string, Row>();
  for (const row of [...drunk, ...cellar, ...wished]) {
    if (!row.Winery || !row["Wine name"]) continue;
    if (!labels.has(key(row))) labels.set(key(row), row);
  }
  const unknownTypes = [...labels.values()]
    .map((row) => row["Wine type"])
    .filter((type) => !KINDS[type.toLowerCase()]);
  if (unknownTypes.length > 0) {
    process.stderr.write(
      `no Kind for Vivino's wine type: ${[...new Set(unknownTypes)].join(", ")}\n`
    );
    process.exitCode = 1;
    return;
  }

  requireDatabaseUrl();
  const { closePool, query } = await import("../src/core/db.ts");
  const { createLabel } = await import("../src/core/verbs/label.ts");
  const { ensureVintage } = await import("../src/core/verbs/vintage.ts");
  const { addBottles } = await import("../src/core/verbs/bottle.ts");
  const { recordTasting } = await import("../src/core/verbs/tasting.ts");
  const { addWish } = await import("../src/core/verbs/wish.ts");

  const said = (line: string) => process.stdout.write(`${line}\n`);
  const counts = { labels: 0, tastings: 0, bottles: 0, wishes: 0 };

  try {
    const labelIds = new Map<string, string>();
    for (const [k, row] of labels) {
      const kindId = KINDS[row["Wine type"].toLowerCase()] as string;
      const [found] = await query<{ id: string }>(
        `select id from labels
          where lower(coalesce(producer, '')) = lower($1) and lower(name) = lower($2)
          order by created_at limit 1`,
        [row.Winery, row["Wine name"]]
      );
      if (found) {
        labelIds.set(k, found.id);
        continue;
      }
      said(`Label    ${row.Winery}, ${row["Wine name"]} (${row["Wine type"]})`);
      counts.labels++;
      if (!apply) continue;
      const { labelId } = await createLabel({
        producer: row.Winery,
        name: row["Wine name"],
        kindId,
        country: row.Country || null,
        appellation: row.Region || null,
        unverified: false,
        vintage: datingOf(row, kindId),
      });
      labelIds.set(k, labelId);
    }

    /** The Vintage a row names, made if it is not there; null in a dry run for a new Label. */
    const vintageOf = async (row: Row): Promise<string | null> => {
      const labelId = labelIds.get(key(row));
      if (!labelId) return null;
      return ensureVintage(labelId, datingOf(row, KINDS[row["Wine type"].toLowerCase()] as string));
    };
    const where = (row: Row) => `${row["Wine name"]}${row.Vintage ? ` ${row.Vintage}` : ""}`;

    for (const row of drunk) {
      const day = row["Scan date"].slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const vintageId = apply || labelIds.has(key(row)) ? await vintageOf(row) : null;
      if (vintageId) {
        const [held] = await query(
          "select 1 from tastings where vintage_id = $1 and tasted_on = $2::date",
          [vintageId, day]
        );
        if (held) continue;
      }
      const rating = ratingOf(row["Your rating"]);
      said(`Tasting  ${where(row)}, ${day}${rating ? `, rated ${rating}` : ", no rating"}`);
      counts.tastings++;
      if (!apply || !vintageId) continue;
      await recordTasting({
        vintageId,
        tastedOn: day,
        rating,
        place: row["Scan/Review Location"] || null,
        likedIt: row["Your review"] || null,
        notes: row["Personal Note"] || null,
      });
    }

    for (const row of cellar) {
      const want = Number(row["User cellar count"]);
      if (!Number.isInteger(want) || want < 1) continue;
      const vintageId = apply || labelIds.has(key(row)) ? await vintageOf(row) : null;
      let have = 0;
      if (vintageId) {
        const [row2] = await query<{ n: string }>(
          "select count(*) as n from bottles where vintage_id = $1 and state <> 'finished'",
          [vintageId]
        );
        have = Number(row2?.n ?? 0);
      }
      if (have >= want) continue;
      said(`Bottles  ${where(row)}, ${want - have}`);
      counts.bottles += want - have;
      if (!apply || !vintageId) continue;
      await addBottles(vintageId, want - have);
    }

    // A wine already in the drunk list is not a wish any more: Vivino keeps a wishlisted bottle
    // there after it is scanned, and the owner has said those were drunk.
    const drunkKeys = new Set(drunk.map(key));
    for (const row of wished) {
      if (drunkKeys.has(key(row))) continue;
      const labelId = labelIds.get(key(row));
      if (labelId) {
        const [held] = await query(
          `select 1 from wishes w left join vintages v on v.id = w.vintage_id
            where coalesce(w.label_id, v.label_id) = $1 and w.closed_as is null`,
          [labelId]
        );
        if (held) continue;
      }
      said(`Wish     ${where(row)}`);
      counts.wishes++;
      if (!apply || !labelId) continue;
      const year = Number(row.Vintage);
      await addWish(
        Number.isInteger(year) && year > 0
          ? { vintageId: await vintageOf(row), cameFrom: "Vivino" }
          : { labelId, cameFrom: "Vivino" }
      );
    }

    said("");
    said(
      `${apply ? "imported" : "would import"} ${counts.labels} Labels, ${counts.tastings} Tastings, ` +
        `${counts.bottles} Bottles, ${counts.wishes} Wishes` +
        (apply ? "" : " — run again with --apply to write them")
    );
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
