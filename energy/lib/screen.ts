// View logic of the price screen that needs no React Native: price parts, time
// ranges, the best window label, the shared chart scale, the hour ticks and the
// copy of every empty state.

import type { BestWindow } from "./best.ts";
import { formatAmount, isConverted, unitLabel } from "./format.ts";
import type { Day, Slot } from "./slots.ts";
import { HOUR_MS, formatTime, localDate, offsetMs, parseDate } from "./time.ts";
import type { Zone } from "./zones.ts";

export interface PriceParts {
  amount: string;
  unit: string;
}

export function priceParts(
  value: number,
  zone: Zone,
  locale?: string,
): PriceParts {
  return {
    // Typographic minus for display; the value is unchanged.
    amount: formatAmount(value, locale).replace(/^-/, "\u2212"),
    unit: unitLabel(zone),
  };
}

// What VoiceOver reads: "about 74.40 öre per kilowatt hour".
export function spokenPrice(
  value: number,
  zone: Zone,
  locale?: string,
): string {
  const about = isConverted(zone) ? "about " : "";
  return `${about}${formatAmount(value, locale)} ${zone.subunit} per kilowatt hour`;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

// "Tuesday 27 October" for a zone's calendar date, by the device locale. UTC keeps
// the date as is.
export function dayLabel(date: string, locale?: string): string {
  const key = locale ?? "";
  let formatter = dayFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    dayFormatters.set(key, formatter);
  }
  return formatter.format(parseDate(date));
}

// "06:00–06:15", in the zone's time zone.
export function rangeLabel(
  start: number,
  end: number,
  tz: string,
  locale?: string,
): string {
  return `${formatTime(start, tz, locale)}\u2013${formatTime(end, tz, locale)}`;
}

// "12:30–14:30" on today, "23:00–01:00 tomorrow" across midnight,
// "Tomorrow 00:00–02:00" when it starts tomorrow. today is the zone's date.
export function windowLabel(
  window: BestWindow,
  today: string,
  tz: string,
  locale?: string,
): string {
  const range = rangeLabel(window.start, window.end, tz, locale);
  if (localDate(window.start, tz) !== today) return `Tomorrow ${range}`;
  if (localDate(window.end - 1, tz) !== today) return `${range} tomorrow`;
  return range;
}

// The lowest and the highest quarter of a day (D12). The earlier quarter wins a tie.
export function dayExtremes(day: Day): { low: Slot; high: Slot } {
  let low = day.slots[0];
  let high = day.slots[0];
  for (const slot of day.slots) {
    if (slot.price < low.price) low = slot;
    if (slot.price > high.price) high = slot;
  }
  return { low, high };
}

export interface ChartScale {
  // Price range of the plot, local subunit per kWh. min is 0 unless a price is
  // below zero.
  min: number;
  max: number;
  // Grid lines, zero excluded: the baseline draws it.
  ticks: number[];
}

// A 1, 2 or 5 step of the right power of ten, at least raw.
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * power >= raw) ?? 10;
  return step * power;
}

// One scale for both days, so the heights of today and tomorrow compare. Hourly
// means, as the chart draws them. Headroom above the highest step for the now mark.
export function chartScale(days: readonly (Day | null)[]): ChartScale | null {
  const prices = days.flatMap((day) => day?.hours.map((h) => h.price) ?? []);
  if (prices.length === 0) return null;
  const high = Math.max(0, ...prices);
  const low = Math.min(0, ...prices);
  const step = niceStep(Math.max(high - low, 1) / 3);
  const max = Math.max(high * 1.15, step);
  // Room below zero for a zero or negative hour, at least 4% of the plot.
  const min = prices.some((p) => p <= 0)
    ? Math.min(low * 1.15, -0.04 * max)
    : 0;
  const ticks: number[] = [];
  for (let t = step; t <= high; t += step) ticks.push(t);
  for (let t = -step; t >= low; t -= step) ticks.push(t);
  return { min, max, ticks };
}

// Indices of the hourly steps that start a local hour divisible by `every`. On the
// day DST ends the repeated hour is skipped, so no label shows twice.
export function hourTicks(day: Day, every: number): number[] {
  const seen = new Set<number>();
  const ticks: number[] = [];
  day.hours.forEach((step, i) => {
    const wall = step.start + offsetMs(step.start, day.payload.tz);
    const hour = Math.floor((wall % (24 * HOUR_MS)) / HOUR_MS);
    if (hour % every === 0 && !seen.has(hour)) ticks.push(i);
    seen.add(hour);
  });
  return ticks;
}

export type DayKind = "yesterday" | "today" | "tomorrow";

const POSSESSIVE: Record<DayKind, string> = {
  yesterday: "Yesterday's",
  today: "Today's",
  tomorrow: "Tomorrow's",
};
export type DayStatus =
  "idle" | "loading" | "not-published" | "offline" | "invalid";
export type EmptyAction = "retry" | "showToday";

export type EmptyState =
  | { kind: "loading" }
  | { kind: "message"; message: string; action: EmptyAction; label: string };

// One line and one action for each day that has no prices to show (PLAN.md
// section 4). tomorrowFrom: 13:00 Europe/Berlin on today, shown in the zone's time.
export function emptyState(
  kind: DayKind,
  status: DayStatus,
  now: number,
  tomorrowFrom: number,
  tz: string,
  locale?: string,
): EmptyState {
  const retry = (message: string, label = "Try again"): EmptyState => ({
    kind: "message",
    message,
    action: "retry",
    label,
  });
  if (kind === "tomorrow" && now < tomorrowFrom) {
    return {
      kind: "message",
      message: `Tomorrow's prices usually arrive after ${formatTime(tomorrowFrom, tz, locale)}.`,
      action: "showToday",
      label: "Show today",
    };
  }
  const day = POSSESSIVE[kind];
  switch (status) {
    case "idle":
    case "loading":
      return { kind: "loading" };
    case "offline":
      return retry(
        `No connection, so ${day.toLowerCase()} prices did not load.`,
      );
    case "invalid":
      return retry(`${day} price file failed its check, so it is not shown.`);
    case "not-published":
      switch (kind) {
        case "yesterday":
          return retry("Yesterday's prices are not available.");
        case "today":
          return retry("Today's prices are not published yet.");
        case "tomorrow":
          return retry(
            "Tomorrow's prices are not published yet. WattNot checks every 15 minutes.",
            "Check now",
          );
      }
  }
}
