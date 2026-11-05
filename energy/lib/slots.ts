// A validated payload as quarter slots and hourly chart steps. Identity is the UTC
// instant; labels come from the zone's time zone (D13).

import { isZeroOrNegative, levelOf, type Level } from "./levels.ts";
import { toSubunitPerKwh } from "./format.ts";
import { SLOT_MINUTES, type DayPayload } from "./payload.ts";
import { HOUR_MS, MINUTE_MS, formatTime, offsetMs } from "./time.ts";

export const SLOT_MS = SLOT_MINUTES * MINUTE_MS;

export interface Slot {
  // UTC epoch ms. start is the slot's identity.
  start: number;
  end: number;
  // Published value, unrounded.
  eurMwh: number;
  // Local subunit per kWh (c, öre, øre, gr), unrounded, at the day's own rate.
  price: number;
  // Local start time in the zone, "02:00 CEST" or "02:00 CET" on the repeated hour.
  label: string;
  // Against the day's own P25 and P75. Null when the day has no levels.
  level: Level | null;
  zeroOrNegative: boolean;
}

export interface HourStep {
  start: number;
  end: number;
  // Means of the quarters of the local hour.
  eurMwh: number;
  price: number;
  label: string;
  level: Level | null;
  zeroOrNegative: boolean;
  // The quarters, for the readout while a finger is down.
  slots: Slot[];
}

export interface Day {
  payload: DayPayload;
  // 92, 96 or 100 quarters.
  slots: Slot[];
  // 23, 24 or 25 hourly steps.
  hours: HourStep[];
}

// Slot i covers [start_utc + 15 min * i, start_utc + 15 min * (i + 1)).
export function buildDay(payload: DayPayload, locale?: string): Day {
  const tz = payload.tz;
  const rate = payload.fx?.rate ?? 1;
  const cuts = payload.levels_eur_mwh;
  const first = Date.parse(payload.start_utc);
  const slots = payload.prices_eur_mwh.map((eurMwh, i): Slot => {
    const start = first + i * SLOT_MS;
    return {
      start,
      end: start + SLOT_MS,
      eurMwh,
      price: toSubunitPerKwh(eurMwh, rate),
      label: formatTime(start, tz, locale),
      level: levelOf(eurMwh, cuts),
      zeroOrNegative: isZeroOrNegative(eurMwh),
    };
  });

  // Group the quarters by the instant at which their local hour starts. The
  // repeated hour of the DST end gives two groups, one per offset.
  const groups = new Map<number, Slot[]>();
  for (const slot of slots) {
    const local = slot.start + offsetMs(slot.start, tz);
    const hourStart = slot.start - (local % HOUR_MS);
    const group = groups.get(hourStart);
    if (group) group.push(slot);
    else groups.set(hourStart, [slot]);
  }
  const hours = [...groups.values()].map((quarters): HourStep => {
    const mean = (pick: (s: Slot) => number) =>
      quarters.reduce((sum, s) => sum + pick(s), 0) / quarters.length;
    const eurMwh = mean((s) => s.eurMwh);
    return {
      start: quarters[0].start,
      end: quarters[quarters.length - 1].end,
      eurMwh,
      price: mean((s) => s.price),
      label: quarters[0].label,
      level: levelOf(eurMwh, cuts),
      zeroOrNegative: isZeroOrNegative(eurMwh),
      slots: quarters,
    };
  });
  return { payload, slots, hours };
}

// Slots of consecutive days in instant order, for now, next and the best window
// across midnight. Missing days are skipped.
export function joinDays(...days: (Day | null | undefined)[]): Slot[] {
  return days.flatMap((day) => day?.slots ?? []);
}
