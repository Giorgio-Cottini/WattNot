import assert from "node:assert/strict";
import { test } from "node:test";

import { loadPayload } from "./fixtures/load.ts";
import { nowAndNext } from "./now.ts";
import { buildDay, joinDays } from "./slots.ts";

process.env.TZ = "Pacific/Auckland";

const at = (iso: string) => Date.parse(iso);
const today = buildDay(loadPayload("SE3", "2026-10-26"), "en-GB");
const tomorrow = buildDay(loadPayload("SE3", "2026-10-27"), "en-GB");

test("current and next quarter by instant", () => {
  // 14:05 in Stockholm (CET) is 13:05Z.
  const { current, next } = nowAndNext(
    at("2026-10-26T13:05:00Z"),
    joinDays(today, tomorrow),
  );
  assert.equal(current?.label, "14:00");
  assert.equal(next?.label, "14:15");
  assert.equal(next?.start, current?.end);
});

test("at 23:50 the next quarter is tomorrow's 00:00, not today's (F08)", () => {
  const { current, next } = nowAndNext(
    at("2026-10-26T22:50:00Z"),
    joinDays(today, tomorrow),
  );
  assert.equal(current?.label, "23:45");
  assert.equal(next?.label, "00:00");
  assert.equal(next?.start, at("2026-10-26T23:00:00Z"));
  assert.equal(next?.eurMwh, 17.75);
  assert.notEqual(next?.start, today.slots[0].start);
});

test("next is hidden while tomorrow is unpublished", () => {
  const { current, next } = nowAndNext(
    at("2026-10-26T22:50:00Z"),
    joinDays(today, null),
  );
  assert.equal(current?.label, "23:45");
  assert.equal(next, null);
});

test("an instant outside the published series has no current quarter", () => {
  assert.deepEqual(
    nowAndNext(at("2026-10-25T22:59:00Z"), joinDays(today, tomorrow)),
    {
      current: null,
      next: null,
    },
  );
  assert.deepEqual(
    nowAndNext(at("2026-10-27T23:00:00Z"), joinDays(today, tomorrow)),
    {
      current: null,
      next: null,
    },
  );
  assert.deepEqual(nowAndNext(at("2026-10-26T12:00:00Z"), []), {
    current: null,
    next: null,
  });
});

test("on the DST end day 02:45 CEST is followed by 02:00 CET", () => {
  const dst = buildDay(loadPayload("SE3", "2026-10-25"), "en-GB");
  const { current, next } = nowAndNext(
    at("2026-10-25T00:50:00Z"),
    joinDays(dst),
  );
  assert.equal(current?.label, "02:45 CEST");
  assert.equal(next?.label, "02:00 CET");
  assert.equal(next?.start, at("2026-10-25T01:00:00Z"));
});
