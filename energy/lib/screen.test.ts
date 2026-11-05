import assert from "node:assert/strict";
import { test } from "node:test";

import type { BestWindow } from "./best.ts";
import { loadPayload } from "./fixtures/load.ts";
import {
  chartScale,
  dayExtremes,
  dayLabel,
  emptyState,
  hourTicks,
  priceParts,
  rangeLabel,
  spokenPrice,
  windowLabel,
} from "./screen.ts";
import { buildDay } from "./slots.ts";
import { HOUR_MS, zonedInstant } from "./time.ts";
import { ZONES } from "./zones.ts";

const L = "en-GB";
const STOCKHOLM = "Europe/Stockholm";

test("price parts split amount and unit", () => {
  assert.deepEqual(priceParts(74.4, ZONES.SE3, L), {
    amount: "74.40",
    unit: "öre/kWh",
  });
  assert.equal(priceParts(-9.25, ZONES.SE3, L).amount, "\u22129.25");
  assert.deepEqual(priceParts(8.75, ZONES.GER, L), {
    amount: "8.75",
    unit: "c/kWh",
  });
  assert.equal(
    spokenPrice(74.4, ZONES.SE3, L),
    "about 74.40 öre per kilowatt hour",
  );
  assert.equal(spokenPrice(8.75, ZONES.GER, L), "8.75 c per kilowatt hour");
});

test("a day label names the zone's date, whatever the device time zone", () => {
  assert.equal(dayLabel("2026-10-27", L), "Tuesday 27 October");
  assert.equal(dayLabel("2026-03-29", "en-US"), "Sunday, March 29");
});

test("ranges are labelled in the zone's time zone", () => {
  const start = Date.parse("2026-10-27T05:00:00Z");
  assert.equal(
    rangeLabel(start, start + HOUR_MS / 4, STOCKHOLM, L),
    "06:00\u201306:15",
  );
});

function window(start: string, hours: number): BestWindow {
  const s = Date.parse(start);
  return {
    start: s,
    end: s + hours * HOUR_MS,
    price: 1,
    nowPrice: 2,
    difference: -1,
    startsNow: false,
  };
}

test("the best window says when it is tomorrow", () => {
  const today = "2026-10-27";
  // 12:30 to 14:30 CET.
  assert.equal(
    windowLabel(window("2026-10-27T11:30:00Z", 2), today, STOCKHOLM, L),
    "12:30\u201314:30",
  );
  // Ends at midnight: still today.
  assert.equal(
    windowLabel(window("2026-10-27T21:00:00Z", 2), today, STOCKHOLM, L),
    "22:00\u201300:00",
  );
  assert.equal(
    windowLabel(window("2026-10-27T22:00:00Z", 2), today, STOCKHOLM, L),
    "23:00\u201301:00 tomorrow",
  );
  assert.equal(
    windowLabel(window("2026-10-27T23:00:00Z", 2), today, STOCKHOLM, L),
    "Tomorrow 00:00\u201302:00",
  );
});

test("the extremes are quarters, the earlier one wins a tie", () => {
  const day = buildDay(loadPayload("SE3", "2026-10-27"), L);
  const { low, high } = dayExtremes(day);
  const prices = day.slots.map((s) => s.price);
  assert.equal(low.price, Math.min(...prices));
  assert.equal(high.price, Math.max(...prices));
  assert.equal(low.start, day.slots[prices.indexOf(Math.min(...prices))].start);

  const flat = buildDay(
    loadPayload("SE3", "2026-10-27", (raw) => {
      raw.prices_eur_mwh = (raw.prices_eur_mwh as number[]).map(() => 50);
    }),
    L,
  );
  assert.equal(dayExtremes(flat).low, flat.slots[0]);
  assert.equal(dayExtremes(flat).high, flat.slots[0]);
});

test("one chart scale for both days, with room below zero", () => {
  const today = buildDay(loadPayload("SE3", "2026-10-26"), L);
  const tomorrow = buildDay(loadPayload("SE3", "2026-10-27"), L);
  const scale = chartScale([today, tomorrow])!;
  const highest = Math.max(
    ...[today, tomorrow].flatMap((d) => d.hours.map((h) => h.price)),
  );
  assert.equal(scale.min, 0);
  assert.ok(scale.max > highest);
  // Highest hourly mean 147.87: the grid stops below it.
  assert.deepEqual(scale.ticks, [50, 100]);
  assert.equal(chartScale([null, null]), null);

  const negative = buildDay(
    loadPayload("SE3", "2026-10-27", (raw) => {
      (raw.prices_eur_mwh as number[])[48] = -40;
    }),
    L,
  );
  const withNegative = chartScale([negative])!;
  assert.ok(withNegative.min < Math.min(...negative.hours.map((h) => h.price)));
  assert.ok(withNegative.ticks.every((t) => t !== 0));
  // A day whose lowest hour is exactly zero still gets room below the line.
  const zero = buildDay(
    loadPayload("SE3", "2026-10-27", (raw) => {
      for (let i = 48; i < 52; i++) (raw.prices_eur_mwh as number[])[i] = 0;
    }),
    L,
  );
  const withZero = chartScale([zero])!;
  assert.ok(withZero.min < 0);
  assert.ok(withZero.min <= -0.04 * withZero.max);
});

test("hour ticks skip the repeated hour of the DST end and the missing one", () => {
  // 2026-10-25 Stockholm: 25 hourly steps, 02:00 CEST then 02:00 CET.
  const autumn = buildDay(loadPayload("SE3", "2026-10-25"), L);
  assert.equal(autumn.hours.length, 25);
  const autumnLabels = hourTicks(autumn, 6).map((i) => autumn.hours[i].label);
  assert.deepEqual(autumnLabels, ["00:00", "06:00", "12:00", "18:00"]);
  const everyHour = hourTicks(autumn, 1);
  assert.equal(everyHour.length, 24);

  // 2026-03-29 Berlin: 23 hourly steps, 02:00 does not exist.
  const spring = buildDay(loadPayload("GER", "2026-03-29"), L);
  assert.equal(spring.hours.length, 23);
  const springLabels = hourTicks(spring, 3).map((i) => spring.hours[i].label);
  assert.deepEqual(springLabels, [
    "00:00",
    "03:00",
    "06:00",
    "09:00",
    "12:00",
    "15:00",
    "18:00",
    "21:00",
  ]);
});

test("tomorrow before publication names the zone's local time", () => {
  const from = zonedInstant("2026-10-27", 13, 0, "Europe/Berlin");
  const before = emptyState("tomorrow", "idle", from - 1, from, STOCKHOLM, L);
  assert.deepEqual(before, {
    kind: "message",
    message: "Tomorrow's prices usually arrive after 13:00.",
    action: "showToday",
    label: "Show today",
  });
  // Warsaw shares the CET offset, so the time is the same.
  const warsaw = emptyState(
    "tomorrow",
    "idle",
    from - 1,
    from,
    "Europe/Warsaw",
  );
  assert.equal(warsaw.kind, "message");
});

test("every empty state has one line and one action", () => {
  const from = zonedInstant("2026-10-27", 13, 0, "Europe/Berlin");
  const after = from + 1;
  const cases: [
    Parameters<typeof emptyState>[0],
    Parameters<typeof emptyState>[1],
    string,
    string,
  ][] = [
    [
      "today",
      "offline",
      "No connection, so today's prices did not load.",
      "Try again",
    ],
    [
      "today",
      "invalid",
      "Today's price file failed its check, so it is not shown.",
      "Try again",
    ],
    [
      "today",
      "not-published",
      "Today's prices are not published yet.",
      "Try again",
    ],
    [
      "tomorrow",
      "offline",
      "No connection, so tomorrow's prices did not load.",
      "Try again",
    ],
    [
      "tomorrow",
      "invalid",
      "Tomorrow's price file failed its check, so it is not shown.",
      "Try again",
    ],
    [
      "tomorrow",
      "not-published",
      "Tomorrow's prices are not published yet. WattNot checks every 15 minutes.",
      "Check now",
    ],
    [
      "yesterday",
      "offline",
      "No connection, so yesterday's prices did not load.",
      "Try again",
    ],
    [
      "yesterday",
      "invalid",
      "Yesterday's price file failed its check, so it is not shown.",
      "Try again",
    ],
    [
      "yesterday",
      "not-published",
      "Yesterday's prices are not available.",
      "Try again",
    ],
  ];
  for (const [kind, status, message, label] of cases) {
    assert.deepEqual(emptyState(kind, status, after, from, STOCKHOLM, L), {
      kind: "message",
      message,
      action: "retry",
      label,
    });
  }
  assert.deepEqual(emptyState("today", "loading", after, from, STOCKHOLM, L), {
    kind: "loading",
  });
  assert.deepEqual(emptyState("tomorrow", "idle", after, from, STOCKHOLM, L), {
    kind: "loading",
  });
});
