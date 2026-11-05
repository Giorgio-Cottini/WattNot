// Test fixtures: v1 day objects written to PLAN.md section 2. Node only, never
// imported by the app.

import { readFileSync } from "node:fs";
import { URL } from "node:url";

import { validatePayload, type DayPayload } from "../payload.ts";
import type { CoveredZoneCode } from "../zones.ts";

export function readFixture(
  zone: CoveredZoneCode,
  date: string,
): Record<string, unknown> {
  const url = new URL(`./${zone}-${date}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

// A validated fixture, after an optional edit of the raw object.
export function loadPayload(
  zone: CoveredZoneCode,
  date: string,
  edit?: (raw: Record<string, unknown>) => void,
): DayPayload {
  const raw = readFixture(zone, date);
  edit?.(raw);
  const result = validatePayload(raw, { zone, date });
  if (!result.ok) throw new Error(`fixture ${zone} ${date}: ${result.error}`);
  return result.payload;
}
