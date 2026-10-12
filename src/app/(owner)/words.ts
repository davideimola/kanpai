// THE WORDS EVERY SCREEN SAYS THE SAME WAY: a Vintage, a Level, a day, a count. Plain English,
// sentence case, in `CONTEXT.md`'s vocabulary — and said once, here, so the diary, the Cellar
// and a Label's page cannot disagree about what *NV* is called.
//
// Pure functions over plain values, tested beside themselves (`./words.test.ts`).

type Level = "full" | "3/4" | "1/2" | "1/4";
type Dating = "year" | "nv" | "unknown";

/**
 * A Vintage as the owner reads it. **NV and unknown are never the same words** (ADR-0010): NV
 * is a fact about the wine — the producer blends years — and unknown is a fact about the
 * owner's notes. Spelled out, never `N.V.` (`CONTEXT.md`, **Vintage**).
 */
export function vintageAsWritten(vintage: { dating: Dating; year: number | null }): string {
  if (vintage.dating === "year" && vintage.year !== null) return String(vintage.year);
  return vintage.dating === "nv" ? "No year" : "Year unknown";
}

const LEFT: Record<Level, string> = {
  full: "full",
  "3/4": "¾ left",
  "1/2": "½ left",
  "1/4": "¼ left",
};

/** What is left of an open Bottle: `full`, `½ left`. */
export function levelAsWritten(level: Level): string {
  return LEFT[level];
}

/** An open Bottle in a phrase: `Open, ½ left`. */
export function openAsWritten(level: Level): string {
  return `Open, ${LEFT[level]}`;
}

/** A Level as a fraction a sentence can say: `half`, `a quarter`. */
const IN_WORDS: Record<Level, string> = {
  full: "full",
  "3/4": "three quarters left",
  "1/2": "half left",
  "1/4": "a quarter left",
};

/**
 * A Vintage's Bottles in one sentence: `One open, half left. Two closed.` — what the Label
 * page writes beside the little bottles, so the drawing is never the only way to know.
 */
export function bottlesInWords(bottles: readonly { state: string; level: Level | null }[]): string {
  const open = bottles.filter((bottle) => bottle.state === "open");
  const closed = bottles.filter((bottle) => bottle.state === "closed").length;
  const finished = bottles.filter((bottle) => bottle.state === "finished").length;

  const sentences: string[] = [];
  if (open.length === 1 && open[0]?.level) {
    sentences.push(`One open, ${IN_WORDS[open[0].level]}.`);
  } else if (open.length > 1) {
    sentences.push(`${capitalised(numberAsWritten(open.length))} open.`);
  }
  if (closed > 0) sentences.push(`${capitalised(numberAsWritten(closed))} closed.`);
  if (sentences.length === 0) {
    return finished > 0 ? "None left in the house." : "No bottles in the house.";
  }
  return sentences.join(" ");
}

const SMALL = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** A small number in words, a large one in figures, as prose writes them. */
export function numberAsWritten(n: number): string {
  return SMALL[n] ?? String(n);
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `1 bottle`, `15 bottles`. */
export function counted(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How many times a Label was tasted: `Tasted once`, `Tasted twice`, `Tasted 4 times`. */
export function tastedTimes(n: number): string {
  if (n === 0) return "Not tasted yet";
  if (n === 1) return "Tasted once";
  if (n === 2) return "Tasted twice";
  return `Tasted ${n} times`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * A day as a heading: `Saturday 10 October`, with the year only when it is not this one —
 * `Saturday 14 February 2025`. `day` is `2026-10-10` as the database writes it; `today` too,
 * so the answer does not depend on the server's clock or its time zone.
 */
export function dayAsWritten(day: string, today: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  const heading = `${weekday} ${date} ${MONTHS[month - 1]}`;
  return day.slice(0, 4) === today.slice(0, 4) ? heading : `${heading} ${year}`;
}

/** A moment as a short date: `12 October`, `12 October 2025` in another year. */
export function dateAsWritten(at: Date, today: string): string {
  const day = at.toISOString().slice(0, 10);
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const short = `${date} ${MONTHS[month - 1]}`;
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${year}`;
}

/** Today, as the database writes a day. */
export function todayAsADay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
