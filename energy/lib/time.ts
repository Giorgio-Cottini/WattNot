// Calendar dates and time zone conversions. Every conversion between a UTC instant
// and a wall clock in a zone goes through this module, through Intl.

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// UTC midnight of a YYYY-MM-DD calendar date, NaN when the string is not a real date.
export function parseDate(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) return NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDate(ms) === date ? ms : NaN;
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(parseDate(value));
}

// YYYY-MM-DD of a UTC midnight. Calendar arithmetic only, no zone involved.
function toDate(utcMidnight: number): string {
  return new Date(utcMidnight).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const ms = parseDate(date);
  if (Number.isNaN(ms)) throw new RangeError(`addDays: not a date: ${date}`);
  return toDate(ms + days * DAY_MS);
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

// Wall clock of an instant in a zone. It parses format() instead of calling
// formatToParts, which Hermes on iOS does not split into parts. en-GB is a 24 h
// locale with day, month, year order, so the digit order is fixed.
function wallClock(instant: number, tz: string): WallClock {
  let formatter = wallFormatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    wallFormatters.set(tz, formatter);
  }
  const digits = formatter.format(instant).match(/\d+/g);
  if (!digits || digits.length !== 5) {
    throw new Error(`wallClock: unexpected Intl output for ${tz}`);
  }
  const [day, month, year, hour, minute] = digits.map(Number);
  return { year, month, day, hour: hour % 24, minute };
}

// UTC offset of the zone at an instant: wall clock minus UTC, in ms.
export function offsetMs(instant: number, tz: string): number {
  const w = wallClock(instant, tz);
  const minuteStart =
    instant - (((instant % MINUTE_MS) + MINUTE_MS) % MINUTE_MS);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - minuteStart;
}

// Calendar date of an instant in the zone (not on the device).
export function localDate(instant: number, tz: string): string {
  const w = wallClock(instant, tz);
  return toDate(Date.UTC(w.year, w.month - 1, w.day));
}

// UTC instant of a wall clock time in the zone. The second pass settles a first
// guess whose offset differs from the target's, near a DST change.
export function zonedInstant(
  date: string,
  hour: number,
  minute: number,
  tz: string,
): number {
  const asUtc = parseDate(date) + hour * HOUR_MS + minute * MINUTE_MS;
  if (Number.isNaN(asUtc))
    throw new RangeError(`zonedInstant: not a date: ${date}`);
  const guess = asUtc - offsetMs(asUtc, tz);
  const instant = asUtc - offsetMs(guess, tz);
  if (instant + offsetMs(instant, tz) !== asUtc) {
    throw new RangeError(
      `zonedInstant: ${date} ${hour}:${minute} does not exist in ${tz}`,
    );
  }
  return instant;
}

// Length of a local calendar day in the zone, in slots of the given size:
// 96 quarters on most days, 92 when DST starts and 100 when it ends.
export function daySlotCount(date: string, tz: string, slotMs: number): number {
  const start = zonedInstant(date, 0, 0, tz);
  const end = zonedInstant(addDays(date, 1), 0, 0, tz);
  return (end - start) / slotMs;
}

// True when the instant's wall clock time occurs twice that day, in the hour
// repeated when DST ends (EU zones shift by one hour).
function isRepeatedWallTime(instant: number, tz: string): boolean {
  const wall = instant + offsetMs(instant, tz);
  return [-HOUR_MS, HOUR_MS].some(
    (shift) => instant + shift + offsetMs(instant + shift, tz) === wall,
  );
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(
  tz: string,
  locale: string | undefined,
  withZone: boolean,
): Intl.DateTimeFormat {
  const key = `${tz}|${locale ?? ""}|${withZone}`;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      ...(withZone ? { timeZoneName: "short" } : {}),
    });
    timeFormatters.set(key, formatter);
  }
  return formatter;
}

// Local time of an instant in the zone's time zone, never the device's, formatted
// by the device locale unless one is given ("14:00"). A time that occurs twice
// on the day DST ends carries the zone abbreviation, "02:00 CEST" then
// "02:00 CET" (D13).
export function formatTime(
  instant: number,
  tz: string,
  locale?: string,
): string {
  return timeFormatter(tz, locale, isRepeatedWallTime(instant, tz)).format(
    instant,
  );
}
