import assert from "node:assert/strict";
import { test } from "node:test";

import { loadPayload } from "./fixtures/load.ts";
import { SLOT_MS, buildDay, joinDays } from "./slots.ts";

// The device runs in another zone than the payload's: labels must not move.
process.env.TZ = "America/Los_Angeles";

const at = (iso: string) => Date.parse(iso);
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("a 96 slot day: UTC instants, local labels, converted prices", () => {
  const day = buildDay(loadPayload("SE3", "2026-10-27"), "en-GB");
  assert.equal(day.slots.length, 96);
  assert.equal(day.slots[0].start, at("2026-10-26T23:00:00Z"));
  assert.equal(day.slots[95].end, at("2026-10-27T23:00:00Z"));
  day.slots.forEach((s, i) =>
    assert.equal(s.end - s.start, SLOT_MS, `slot ${i}`),
  );
  assert.equal(day.slots[0].label, "00:00");
  assert.equal(day.slots[57].label, "14:15");
  assert.equal(day.slots[95].label, "23:45");
  assert.equal(day.slots[0].eurMwh, 17.75);
  close(day.slots[0].price, (17.75 * 11.1834) / 10);
  assert.equal(day.slots[0].level, "cheap");
  assert.equal(day.slots[0].zeroOrNegative, false);
});

test("hourly steps are means of the quarters of each local hour", () => {
  const day = buildDay(loadPayload("SE3", "2026-10-27"), "en-GB");
  assert.equal(day.hours.length, 24);
  const first = day.hours[0];
  const quarters = day.payload.prices_eur_mwh.slice(0, 4);
  close(first.eurMwh, quarters.reduce((a, b) => a + b) / 4);
  close(first.price, (first.eurMwh * 11.1834) / 10);
  assert.equal(first.start, at("2026-10-26T23:00:00Z"));
  assert.equal(first.end, at("2026-10-27T00:00:00Z"));
  assert.equal(first.label, "00:00");
  assert.equal(first.slots.length, 4);
  assert.equal(day.hours[14].label, "14:00");
});

test("the DST end day has 100 slots and 25 hours with a labelled repeated hour", () => {
  const day = buildDay(loadPayload("SE3", "2026-10-25"), "en-GB");
  assert.equal(day.slots.length, 100);
  assert.deepEqual(
    day.slots.slice(7, 17).map((s) => s.label),
    [
      "01:45",
      "02:00 CEST",
      "02:15 CEST",
      "02:30 CEST",
      "02:45 CEST",
      "02:00 CET",
      "02:15 CET",
      "02:30 CET",
      "02:45 CET",
      "03:00",
    ],
  );
  assert.equal(day.hours.length, 25);
  assert.deepEqual(
    day.hours.slice(0, 5).map((h) => h.label),
    ["00:00", "01:00", "02:00 CEST", "02:00 CET", "03:00"],
  );
  assert.equal(day.hours[2].start, at("2026-10-25T00:00:00Z"));
  assert.equal(day.hours[3].start, at("2026-10-25T01:00:00Z"));
  assert.equal(day.hours[24].label, "23:00");
  assert.equal(day.hours[24].end, at("2026-10-25T23:00:00Z"));
});

test("the DST start day has 92 slots and 23 hours, without 02:00", () => {
  const day = buildDay(loadPayload("GER", "2026-03-29"), "en-GB");
  assert.equal(day.slots.length, 92);
  assert.equal(day.slots[7].label, "01:45");
  assert.equal(day.slots[8].label, "03:00");
  assert.equal(day.slots[8].start - day.slots[7].start, SLOT_MS);
  assert.equal(day.hours.length, 23);
  assert.deepEqual(
    day.hours.slice(0, 4).map((h) => h.label),
    ["00:00", "01:00", "03:00", "04:00"],
  );
  // EUR: rate 1, no conversion beyond the unit.
  close(day.slots[10].price, day.slots[10].eurMwh / 10);
});

test("negative prices are marked, and null levels give no level", () => {
  const day = buildDay(loadPayload("DK1", "2026-05-10"), "en-GB");
  const negative = day.slots.filter((s) => s.eurMwh <= 0);
  assert.ok(negative.length > 0);
  assert.ok(negative.every((s) => s.zeroOrNegative && s.price <= 0));
  assert.ok(day.slots.every((s) => s.level === null));
  assert.ok(day.hours.every((h) => h.level === null));
  close(day.slots[0].price, (day.slots[0].eurMwh * 7.4612) / 10);
});

test("joinDays keeps instant order and skips missing days", () => {
  const today = buildDay(loadPayload("SE3", "2026-10-26"), "en-GB");
  const tomorrow = buildDay(loadPayload("SE3", "2026-10-27"), "en-GB");
  const series = joinDays(today, tomorrow);
  assert.equal(series.length, 192);
  assert.equal(series[95].end, series[96].start);
  assert.equal(joinDays(today, null).length, 96);
  assert.equal(joinDays(undefined, null).length, 0);
});
