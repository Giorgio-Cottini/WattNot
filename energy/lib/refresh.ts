// The refresh planner of PLAN.md section 4: which dates to fetch now. Today when
// missing. Tomorrow when missing, only after 13:00 Europe/Berlin and at most every
// 15 minutes, unless the user pulls to refresh. Yesterday when missing, at most
// every 15 minutes: it is final, so one answer settles it.

import { MINUTE_MS, addDays, localDate, zonedInstant } from "./time.ts";
import type { Zone } from "./zones.ts";

// The backend publishes tomorrow from 13:00 Europe/Berlin (PLAN.md section 3).
const PUBLICATION_TZ = "Europe/Berlin";
const PUBLICATION_HOUR = 13;
export const TOMORROW_RETRY_MS = 15 * MINUTE_MS;

export interface RefreshInput {
  now: number;
  zone: Zone;
  // Dates of the zone that hold a valid payload, from disk or network.
  cached: ReadonlySet<string>;
  // Date to the instant of its last fetch attempt.
  lastAttempt: Readonly<Record<string, number>>;
  // Pull to refresh: skips the 15 minute spacing, not the publication time.
  force?: boolean;
}

export interface RefreshPlan {
  // Local calendar dates of the zone, never of the device.
  yesterday: string;
  today: string;
  tomorrow: string;
  // Instant from which tomorrow can be published: 13:00 Europe/Berlin on today.
  tomorrowFrom: number;
  // Dates to fetch now, today first, yesterday last. Empty for a zone without a
  // source.
  fetch: string[];
}

export function planRefresh(input: RefreshInput): RefreshPlan {
  const { now, zone, cached, lastAttempt, force = false } = input;
  const today = localDate(now, zone.tz);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  // 13:00 wall clock in Berlin on the zone's today, converted to an instant.
  const tomorrowFrom = zonedInstant(today, PUBLICATION_HOUR, 0, PUBLICATION_TZ);
  // A day that answered without prices is asked again after 15 minutes.
  const spaced = (date: string) => {
    const last = lastAttempt[date];
    return force || last === undefined || now - last >= TOMORROW_RETRY_MS;
  };
  const fetch: string[] = [];
  if (zone.covered) {
    if (!cached.has(today)) fetch.push(today);
    if (!cached.has(tomorrow) && now >= tomorrowFrom && spaced(tomorrow))
      fetch.push(tomorrow);
    if (!cached.has(yesterday) && spaced(yesterday)) fetch.push(yesterday);
  }
  return { yesterday, today, tomorrow, tomorrowFrom, fetch };
}
