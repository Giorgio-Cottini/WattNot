import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  daySlotCount,
  formatTime,
  isDate,
  localDate,
  offsetMs,
  zonedInstant,
} from "./time.ts";

// The device runs in another zone than every zone under test.
process.env.TZ = "America/New_York";

const QUARTER = 15 * 60_000;
const at = (iso: string) => Date.parse(iso);

test("dates are calendar dates", () => {
  assert.equal(isDate("2026-10-25"), true);
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-1-05"), false);
  assert.equal(isDate(20261025), false);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-10-25", 1), "2026-10-26");
});

test("offsets change at the DST end", () => {
  assert.equal(
    offsetMs(at("2026-10-25T00:30:00Z"), "Europe/Stockholm"),
    2 * 3_600_000,
  );
  assert.equal(
    offsetMs(at("2026-10-25T01:30:00Z"), "Europe/Stockholm"),
    3_600_000,
  );
  assert.equal(
    offsetMs(at("2026-10-25T01:30:00Z"), "Europe/Helsinki"),
    2 * 3_600_000,
  );
});

test("the local date is the zone's, not the device's", () => {
  const instant = at("2026-10-26T23:30:00Z");
  assert.equal(localDate(instant, "Europe/Stockholm"), "2026-10-27");
  assert.equal(localDate(instant, "America/New_York"), "2026-10-26");
});

test("wall clock times convert to instants", () => {
  assert.equal(
    zonedInstant("2026-10-25", 0, 0, "Europe/Stockholm"),
    at("2026-10-24T22:00:00Z"),
  );
  assert.equal(
    zonedInstant("2026-10-26", 0, 0, "Europe/Stockholm"),
    at("2026-10-25T23:00:00Z"),
  );
  assert.equal(
    zonedInstant("2026-03-29", 13, 0, "Europe/Berlin"),
    at("2026-03-29T11:00:00Z"),
  );
  assert.equal(
    zonedInstant("2026-10-25", 13, 0, "Europe/Berlin"),
    at("2026-10-25T12:00:00Z"),
  );
  assert.throws(
    () => zonedInstant("2026-03-29", 2, 30, "Europe/Berlin"),
    RangeError,
  );
});

test("local days have 92, 96 or 100 quarters", () => {
  assert.equal(daySlotCount("2026-03-29", "Europe/Berlin", QUARTER), 92);
  assert.equal(daySlotCount("2026-10-26", "Europe/Stockholm", QUARTER), 96);
  assert.equal(daySlotCount("2026-10-25", "Europe/Stockholm", QUARTER), 100);
  assert.equal(daySlotCount("2026-10-25", "Europe/Helsinki", QUARTER), 100);
});

test("labels are local to the zone and mark the repeated hour", () => {
  const tz = "Europe/Stockholm";
  assert.equal(formatTime(at("2026-10-26T13:00:00Z"), tz, "en-GB"), "14:00");
  assert.equal(
    formatTime(at("2026-10-25T00:00:00Z"), tz, "en-GB"),
    "02:00 CEST",
  );
  assert.equal(
    formatTime(at("2026-10-25T00:45:00Z"), tz, "en-GB"),
    "02:45 CEST",
  );
  assert.equal(
    formatTime(at("2026-10-25T01:00:00Z"), tz, "en-GB"),
    "02:00 CET",
  );
  assert.equal(
    formatTime(at("2026-10-25T01:45:00Z"), tz, "en-GB"),
    "02:45 CET",
  );
  assert.equal(formatTime(at("2026-10-24T23:45:00Z"), tz, "en-GB"), "01:45");
  assert.equal(formatTime(at("2026-10-25T02:00:00Z"), tz, "en-GB"), "03:00");
});
