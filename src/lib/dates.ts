import { normalize } from "./transcript";

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const UNITS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const ORDINAL_UNITS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
};

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return iso(date);
}

function addDays(anchor: string, days: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

/** `first` / `twenty first` / `2nd` / `2` at position `i`; returns the day and tokens consumed. */
function readDay(tokens: string[], i: number): { day: number; used: number } | null {
  const numeric = tokens[i]?.match(/^(\d{1,2})(st|nd|rd|th)?$/);
  if (numeric) return { day: Number(numeric[1]), used: 1 };

  if (tokens[i] === "twenty" || tokens[i] === "thirty") {
    const tens = tokens[i] === "twenty" ? 20 : 30;
    const unit = ORDINAL_UNITS[tokens[i + 1] ?? ""];
    if (unit && unit < 10) return { day: tens + unit, used: 2 };
  }
  const single = ORDINAL_UNITS[tokens[i] ?? ""];
  if (single) return { day: single, used: 1 };
  return null;
}

/** `2026` / `twenty twenty six` / `two thousand twenty six`; returns the year and tokens consumed. */
function readYear(tokens: string[], i: number): { year: number; used: number } | null {
  if (/^\d{4}$/.test(tokens[i] ?? "")) return { year: Number(tokens[i]), used: 1 };

  if (tokens[i] === "twenty" && tokens[i + 1] === "twenty") {
    const unit = UNITS[tokens[i + 2] ?? ""];
    if (unit && unit < 10) return { year: 2020 + unit, used: 3 };
    return { year: 2020, used: 2 };
  }
  if (tokens[i] === "two" && tokens[i + 1] === "thousand") {
    if (tokens[i + 2] === "twenty") {
      const unit = UNITS[tokens[i + 3] ?? ""];
      if (unit && unit < 10) return { year: 2020 + unit, used: 4 };
      return { year: 2020, used: 3 };
    }
    const unit = UNITS[tokens[i + 2] ?? ""];
    if (unit) return { year: 2000 + unit, used: 3 };
  }
  return null;
}

/**
 * The only anchor date the pipeline accepts from a recording: a full calendar
 * date spoken in the transcript. A month without a year is not an anchor (R6).
 */
export function findAnchorDate(text: string): string | null {
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return fromParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // Speech recognition rewrites a spoken date into the written US form, so
  // "March second, twenty twenty six" arrives as 03/02/2026 (ADR-0020).
  const slashMatch = text.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (slashMatch) {
    return fromParts(Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2]));
  }

  const tokens = normalize(text).split(" ");
  for (let i = 0; i < tokens.length; i += 1) {
    const month = MONTHS[tokens[i]];
    if (!month) continue;
    const day = readDay(tokens, i + 1);
    if (!day) continue;
    const year = readYear(tokens, i + 1 + day.used);
    if (!year) continue;
    const date = fromParts(year.year, month, day.day);
    if (date) return date;
  }
  return null;
}

const LEAD_IN = /^(by|on|due|until|till|no later than|before end of|the)\s+/;

/** SPEC D1-D7: resolve only expressions whose meaning is not disputable. */
export function resolveRelative(raw: string, anchor: string | null): string | null {
  if (!anchor || !raw.trim()) return null;

  let phrase = normalize(raw);
  let previous = "";
  while (phrase !== previous) {
    previous = phrase;
    phrase = phrase.replace(LEAD_IN, "");
  }

  if (phrase === "today") return anchor;
  if (phrase === "tomorrow") return addDays(anchor, 1);
  if (phrase === "day after tomorrow") return addDays(anchor, 2);

  const inDays = phrase.match(/^in (\d+|[a-z]+) days?$/);
  if (inDays) {
    const count = /^\d+$/.test(inDays[1]) ? Number(inDays[1]) : UNITS[inDays[1]];
    return count ? addDays(anchor, count) : null;
  }

  const weekday = phrase.match(/^(?:this )?([a-z]+)$/);
  if (weekday && weekday[1] in WEEKDAYS) {
    const target = WEEKDAYS[weekday[1]];
    const current = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    const delta = (target - current + 7) % 7 || 7;
    return addDays(anchor, delta);
  }

  if (/^end of (the|this) week$/.test(phrase)) {
    const current = new Date(`${anchor}T00:00:00Z`).getUTCDay();
    if (current === 0 || current === 6) return null;
    return addDays(anchor, 5 - current);
  }

  return null;
}
