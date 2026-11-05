// Display of prices in the local subunit per kWh (D16), the caption (D17) and the
// source notes that CC BY 4.0 requires.

import type { DayPayload } from "./payload.ts";
import { parseDate } from "./time.ts";
import { ZONES, type Zone } from "./zones.ts";

export const CAPTION =
  "Day-ahead spot price, excl. VAT, taxes, grid fees and supplier margin.";

export const LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";

// EUR/MWh to the local subunit per kWh: x EUR/MWh is x * rate local units per MWh,
// and 1 unit/MWh is 100 subunits per 1000 kWh, so x * rate / 10. Rate 1 for EUR.
export function toSubunitPerKwh(eurMwh: number, rate: number): number {
  return (eurMwh * rate) / 10;
}

export function unitLabel(zone: Zone): string {
  return `${zone.subunit}/kWh`;
}

// Converted currencies carry "≈": an ECB reference rate, not a published price.
export function isConverted(zone: Zone): boolean {
  return zone.currency !== "EUR";
}

const amountFormatters = new Map<string, Intl.NumberFormat>();

// 2 decimals, grouping and decimal mark by the device locale unless one is given.
export function formatAmount(value: number, locale?: string): string {
  const key = locale ?? "";
  let formatter = amountFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    amountFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

// "≈ 19.85 öre/kWh" for a converted currency, "8.75 c/kWh" for EUR. The value is
// already in the subunit per kWh.
export function formatPrice(
  value: number,
  zone: Zone,
  locale?: string,
): string {
  const approx = isConverted(zone) ? "≈ " : "";
  return `${approx}${formatAmount(value, locale)} ${unitLabel(zone)}`;
}

// The calendar date of the ECB rate, by the device locale. UTC keeps the date as is.
function formatRateDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parseDate(date));
}

export interface NotedDay {
  payload: DayPayload;
  // "today" or "tomorrow", named when the two days use different rates.
  label: string;
}

// Credits of the days shown, the change note and the ECB line, each once
// (PLAN.md section 2, credits). Two rate dates name their day: "of 23 Oct 2026
// (today) and 26 Oct 2026 (tomorrow)".
export function sourceNotes(
  days: readonly NotedDay[],
  locale?: string,
): string[] {
  if (days.length === 0) return [];
  const unit = unitLabel(ZONES[days[0].payload.zone]);
  const credits = [...new Set(days.map((d) => d.payload.source.credit))];
  const rated = days.flatMap((d) =>
    d.payload.fx ? [{ date: d.payload.fx.date, label: d.label }] : [],
  );
  if (rated.length === 0) {
    return [...credits, `Converted from EUR/MWh to ${unit} by WattNot.`];
  }
  const dates = new Set(rated.map((r) => r.date));
  const rate =
    dates.size === 1
      ? formatRateDate(rated[0].date, locale)
      : rated
          .map((r) => `${formatRateDate(r.date, locale)} (${r.label})`)
          .join(" and ");
  return [
    ...credits,
    `Converted from EUR/MWh to ${unit} by WattNot at the ECB reference rate of ${rate}.`,
    "Exchange rate: European Central Bank reference rate.",
  ];
}
