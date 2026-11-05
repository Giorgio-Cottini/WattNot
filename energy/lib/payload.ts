// The v1 day object of PLAN.md section 2 and its strict validator. Every payload,
// from the network or from the disk cache, passes here before use.

import { MINUTE_MS, daySlotCount, isDate, zonedInstant } from "./time.ts";
import { ZONES, type CoveredZoneCode, type Currency } from "./zones.ts";

export interface Fx {
  quote: Currency;
  rate: number;
  date: string;
  source: "ECB";
}

export interface LevelCuts {
  p25: number;
  p75: number;
  window_days: number;
}

export interface Source {
  id: string;
  credit: string;
  url: string;
}

export interface DayPayload {
  schema: 1;
  zone: CoveredZoneCode;
  date: string;
  tz: string;
  currency: Currency;
  interval_minutes: 15;
  start_utc: string;
  prices_eur_mwh: number[];
  fx: Fx | null;
  levels_eur_mwh: LevelCuts | null;
  source: Source;
  generated_at: string;
}

export type Validation =
  | { ok: true; payload: DayPayload }
  | { ok: false; error: string };

export const SLOT_MINUTES = 15;

const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Null when the fx block fits the zone's currency, else the error.
function fxError(fx: unknown, currency: Currency): string | null {
  if (currency === "EUR") return fx === null ? null : "fx must be null for EUR";
  if (!isObj(fx)) return `fx missing for ${currency}`;
  if (fx.quote !== currency)
    return `fx.quote ${String(fx.quote)} is not ${currency}`;
  if (!isFiniteNumber(fx.rate) || fx.rate <= 0)
    return "fx.rate is not a positive number";
  if (!isDate(fx.date)) return "fx.date is not a date";
  if (fx.source !== "ECB") return "fx.source is not ECB";
  return null;
}

function levelsError(levels: unknown): string | null {
  if (levels === null) return null;
  if (!isObj(levels)) return "levels_eur_mwh is neither null nor an object";
  if (!isFiniteNumber(levels.p25) || !isFiniteNumber(levels.p75)) {
    return "levels_eur_mwh.p25 or p75 is not a finite number";
  }
  if (levels.p25 > levels.p75) return "levels_eur_mwh.p25 exceeds p75";
  const days = levels.window_days;
  if (!Number.isInteger(days) || (days as number) <= 0) {
    return "levels_eur_mwh.window_days is not a positive integer";
  }
  return null;
}

// Checks a parsed JSON value against the v1 contract, and against the zone and
// date it was requested for. Never throws: the outcome is typed.
export function validatePayload(
  raw: unknown,
  expected: { zone: CoveredZoneCode; date: string },
): Validation {
  const fail = (error: string): Validation => ({ ok: false, error });
  if (!isObj(raw)) return fail("payload is not an object");
  if (raw.schema !== 1) return fail(`schema ${String(raw.schema)} is not 1`);
  if (raw.zone !== expected.zone) {
    return fail(`zone ${String(raw.zone)} is not ${expected.zone}`);
  }
  if (raw.date !== expected.date) {
    return fail(`date ${String(raw.date)} is not ${expected.date}`);
  }
  const zone = ZONES[expected.zone];
  if (raw.tz !== zone.tz) return fail(`tz ${String(raw.tz)} is not ${zone.tz}`);
  if (raw.currency !== zone.currency) {
    return fail(`currency ${String(raw.currency)} is not ${zone.currency}`);
  }
  if (raw.interval_minutes !== SLOT_MINUTES) {
    return fail(`interval_minutes ${String(raw.interval_minutes)} is not 15`);
  }

  // start_utc must be local midnight of date in the zone, converted explicitly.
  if (typeof raw.start_utc !== "string" || !UTC_RE.test(raw.start_utc)) {
    return fail("start_utc is not YYYY-MM-DDTHH:MM:SSZ");
  }
  const midnight = zonedInstant(expected.date, 0, 0, zone.tz);
  if (Date.parse(raw.start_utc) !== midnight) {
    return fail(
      `start_utc ${raw.start_utc} is not local midnight of ${expected.date}`,
    );
  }

  // One price per quarter of the local day: 92, 96 or 100.
  const prices = raw.prices_eur_mwh;
  if (!Array.isArray(prices)) return fail("prices_eur_mwh is not an array");
  const slots = daySlotCount(expected.date, zone.tz, SLOT_MINUTES * MINUTE_MS);
  if (prices.length !== slots) {
    return fail(
      `prices_eur_mwh has ${prices.length} values, the day has ${slots} slots`,
    );
  }
  const bad = prices.findIndex((p) => !isFiniteNumber(p));
  if (bad >= 0) return fail(`prices_eur_mwh[${bad}] is not a finite number`);

  const fx = fxError(raw.fx, zone.currency);
  if (fx) return fail(fx);
  const levels = levelsError(raw.levels_eur_mwh);
  if (levels) return fail(levels);

  const source = raw.source;
  if (
    !isObj(source) ||
    !isText(source.id) ||
    !isText(source.credit) ||
    !isText(source.url)
  ) {
    return fail("source needs a non-empty id, credit and url");
  }
  if (
    typeof raw.generated_at !== "string" ||
    Number.isNaN(Date.parse(raw.generated_at))
  ) {
    return fail("generated_at is not a timestamp");
  }
  return { ok: true, payload: raw as unknown as DayPayload };
}
