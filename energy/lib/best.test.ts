import assert from "node:assert/strict";
import { test } from "node:test";

import { bestWindow } from "./best.ts";
import { loadPayload } from "./fixtures/load.ts";
import { buildDay, joinDays, type Day } from "./slots.ts";

process.env.TZ = "America/Chicago";

const at = (iso: string) => Date.parse(iso);
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

// SE3 days with their prices replaced, at their own ECB rates.
function day(
  date: "2026-10-26" | "2026-10-27",
  prices: (i: number) => number,
  rate?: number,
): Day {
  return buildDay(
    loadPayload("SE3", date, (raw) => {
      raw.prices_eur_mwh = (raw.prices_eur_mwh as number[]).map((_, i) =>
        prices(i),
      );
      if (rate !== undefined) (raw.fx as Record<string, unknown>).rate = rate;
    }),
    "en-GB",
  );
}

const R26 = 11.1834;

test("the cheapest window later today, against starting now", () => {
  // 15:00 to 17:00 local (quarters 60 to 67) cost 10, every other quarter 100.
  const today = day("2026-10-26", (i) => (i >= 60 && i < 68 ? 10 : 100));
  const best = bestWindow(at("2026-10-26T11:07:00Z"), joinDays(today), 2);
  assert.ok(best);
  assert.equal(best.start, at("2026-10-26T14:00:00Z"));
  assert.equal(best.end, at("2026-10-26T16:00:00Z"));
  close(best.price, (10 * R26) / 10);
  close(best.nowPrice, (100 * R26) / 10);
  close(best.difference, (-90 * R26) / 10);
  assert.equal(best.startsNow, false);
});

test("now is the cheapest time", () => {
  const today = day("2026-10-26", (i) => i);
  // 12:07 local: the window starts at the current quarter, 12:00.
  const best = bestWindow(at("2026-10-26T11:07:00Z"), joinDays(today), 1);
  assert.ok(best);
  assert.equal(best.start, at("2026-10-26T11:00:00Z"));
  assert.equal(best.startsNow, true);
  assert.equal(best.difference, 0);
});

test("equal windows: the earliest wins", () => {
  const best = bestWindow(
    at("2026-10-26T11:07:00Z"),
    joinDays(day("2026-10-26", () => 50)),
    3,
  );
  assert.equal(best?.startsNow, true);
});

test("the window may cross midnight, each quarter at its own day's rate", () => {
  // 23:30 to 00:30: two cheap quarters today, two tomorrow at another rate.
  const today = day("2026-10-26", (i) => (i >= 94 ? 4 : 100));
  const tomorrow = day("2026-10-27", (i) => (i < 2 ? 8 : 100), 12);
  const best = bestWindow(
    at("2026-10-26T20:00:00Z"),
    joinDays(today, tomorrow),
    1,
  );
  assert.ok(best);
  assert.equal(best.start, at("2026-10-26T22:30:00Z"));
  assert.equal(best.end, at("2026-10-26T23:30:00Z"));
  close(
    best.price,
    ((4 * R26) / 10 + (4 * R26) / 10 + (8 * 12) / 10 + (8 * 12) / 10) / 4,
  );
});

test("published data ends: a window that does not fit gives null", () => {
  const today = day("2026-10-26", () => 50);
  // 23:00 local, tomorrow unpublished: one hour fits, two do not.
  const now = at("2026-10-26T22:00:00Z");
  assert.equal(bestWindow(now, joinDays(today), 2), null);
  assert.equal(bestWindow(now, joinDays(today), 1)?.startsNow, true);
});

test("negative prices win and give a negative difference", () => {
  const today = day("2026-10-26", (i) => (i >= 48 && i < 52 ? -20 : 30));
  const best = bestWindow(at("2026-10-26T06:00:00Z"), joinDays(today), 1);
  assert.ok(best);
  assert.equal(best.start, at("2026-10-26T11:00:00Z"));
  close(best.price, (-20 * R26) / 10);
  assert.ok(best.difference < 0);
});

test("a window never spans a gap in the series", () => {
  // 10-25 then 10-27: a window joining their free ends would average 0.
  const dst = buildDay(
    loadPayload("SE3", "2026-10-25", (raw) => {
      raw.prices_eur_mwh = (raw.prices_eur_mwh as number[]).map((_, i) =>
        i >= 98 ? 0 : 100,
      );
    }),
    "en-GB",
  );
  const later = day("2026-10-27", (i) => (i < 2 ? 0 : 100));
  const best = bestWindow(at("2026-10-25T10:00:00Z"), joinDays(dst, later), 1);
  assert.ok(best);
  assert.equal(best.start, at("2026-10-25T22:00:00Z"));
  close(best.price, (50 * R26) / 10);
  // The window starting now spans the gap: no comparison is possible.
  assert.equal(
    bestWindow(at("2026-10-25T22:30:00Z"), joinDays(dst, later), 1),
    null,
  );
});

test("now outside the series, or a duration that is not whole quarters", () => {
  const today = day("2026-10-26", () => 50);
  assert.equal(
    bestWindow(at("2026-10-27T12:00:00Z"), joinDays(today), 1),
    null,
  );
  assert.throws(
    () => bestWindow(at("2026-10-26T12:00:00Z"), joinDays(today), 0.1),
    RangeError,
  );
  assert.throws(
    () => bestWindow(at("2026-10-26T12:00:00Z"), joinDays(today), 0),
    RangeError,
  );
});
