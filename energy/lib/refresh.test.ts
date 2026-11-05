import assert from "node:assert/strict";
import { test } from "node:test";

import { TOMORROW_RETRY_MS, planRefresh } from "./refresh.ts";
import { ZONES } from "./zones.ts";

// The device date differs from the zone's in the evening (UTC-7 in October).
process.env.TZ = "America/Los_Angeles";

const at = (iso: string) => Date.parse(iso);
const SE3 = ZONES.SE3;
const none = new Set<string>();

test("today and yesterday are fetched when missing, tomorrow not before 13:00 Berlin", () => {
  // 11:00 in Stockholm and Berlin.
  const now = at("2026-10-26T10:00:00Z");
  const plan = planRefresh({ now, zone: SE3, cached: none, lastAttempt: {} });
  assert.equal(plan.yesterday, "2026-10-25");
  assert.equal(plan.today, "2026-10-26");
  assert.equal(plan.tomorrow, "2026-10-27");
  assert.equal(plan.tomorrowFrom, at("2026-10-26T12:00:00Z"));
  assert.deepEqual(plan.fetch, ["2026-10-26", "2026-10-25"]);
  const cached = new Set(["2026-10-25", "2026-10-26"]);
  assert.deepEqual(
    planRefresh({ now, zone: SE3, cached, lastAttempt: {} }).fetch,
    [],
  );
});

test("after 13:00 Berlin tomorrow is fetched at most every 15 minutes", () => {
  const now = at("2026-10-26T12:00:00Z");
  const cached = new Set(["2026-10-25", "2026-10-26"]);
  const plan = (lastAttempt: Record<string, number>, force?: boolean) =>
    planRefresh({ now, zone: SE3, cached, lastAttempt, force }).fetch;
  assert.deepEqual(plan({}), ["2026-10-27"]);
  assert.deepEqual(plan({ "2026-10-27": now - 10 * 60_000 }), []);
  assert.deepEqual(plan({ "2026-10-27": now - TOMORROW_RETRY_MS }), [
    "2026-10-27",
  ]);
  assert.deepEqual(plan({ "2026-10-27": now - 60_000 }, true), ["2026-10-27"]);
  const both = new Set(["2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.deepEqual(
    planRefresh({ now, zone: SE3, cached: both, lastAttempt: {} }).fetch,
    [],
  );
});

test("pull to refresh does not fetch tomorrow before its publication time", () => {
  const now = at("2026-10-26T11:59:00Z");
  const cached = new Set(["2026-10-25", "2026-10-26"]);
  assert.deepEqual(
    planRefresh({ now, zone: SE3, cached, lastAttempt: {}, force: true }).fetch,
    [],
  );
});

test("a missing yesterday is asked again at most every 15 minutes", () => {
  const now = at("2026-10-26T10:00:00Z");
  const cached = new Set(["2026-10-26"]);
  const plan = (lastAttempt: Record<string, number>, force?: boolean) =>
    planRefresh({ now, zone: SE3, cached, lastAttempt, force }).fetch;
  assert.deepEqual(plan({}), ["2026-10-25"]);
  assert.deepEqual(plan({ "2026-10-25": now - 10 * 60_000 }), []);
  assert.deepEqual(plan({ "2026-10-25": now - TOMORROW_RETRY_MS }), [
    "2026-10-25",
  ]);
  assert.deepEqual(plan({ "2026-10-25": now - 60_000 }, true), ["2026-10-25"]);
});

test("dates are the zone's: after local midnight, tomorrow became today", () => {
  // 00:30 on 10-27 in Stockholm, 16:30 on 10-26 on the device.
  const now = at("2026-10-26T23:30:00Z");
  const cached = new Set(["2026-10-26", "2026-10-27"]);
  const plan = planRefresh({ now, zone: SE3, cached, lastAttempt: {} });
  assert.equal(plan.today, "2026-10-27");
  assert.equal(plan.tomorrow, "2026-10-28");
  assert.deepEqual(plan.fetch, []);
});

test("13:00 Berlin moves with DST", () => {
  const spring = planRefresh({
    now: at("2026-03-29T10:00:00Z"),
    zone: ZONES.GER,
    cached: none,
    lastAttempt: {},
  });
  assert.equal(spring.tomorrowFrom, at("2026-03-29T11:00:00Z"));
  const autumn = planRefresh({
    now: at("2026-10-25T10:00:00Z"),
    zone: ZONES.GER,
    cached: none,
    lastAttempt: {},
  });
  assert.equal(autumn.tomorrowFrom, at("2026-10-25T12:00:00Z"));
});

test("a zone without a source fetches nothing", () => {
  const plan = planRefresh({
    now: at("2026-10-26T15:00:00Z"),
    zone: ZONES.FI,
    cached: none,
    lastAttempt: {},
  });
  assert.equal(plan.today, "2026-10-26");
  assert.deepEqual(plan.fetch, []);
});
