import assert from "node:assert/strict";
import { test } from "node:test";

import { readFixture } from "../lib/fixtures/load.ts";
import type { CoveredZoneCode, ZoneCode } from "../lib/zones.ts";
import { fetchDay } from "./api.ts";
import { memoryStorage, settle } from "./fakes.ts";
import { createDataStore, type DataStore } from "./store.ts";

// The device zone differs from the price zone on purpose.
process.env.TZ = "America/Los_Angeles";

const MIN = 60_000;

// One store over fakes: a clock, memory storage, a CDN that serves the days put
// in `served` and answers 403 otherwise, and timers that the test fires.
class Harness {
  clock: number;
  storage = memoryStorage();
  served = new Map<string, string>();
  offline = false;
  // Requests of this zone wait until release() is called.
  held: { zone: string; release: () => void; gate: Promise<void> } | null =
    null;
  requests: string[] = [];
  timer: { run: () => void; ms: number } | null = null;
  warnings: string[] = [];
  store: DataStore;

  constructor(iso: string, storage = memoryStorage()) {
    this.clock = Date.parse(iso);
    this.storage = storage;
    this.store = createDataStore({
      storage: this.storage,
      fetchDay: (zone, date) =>
        fetchDay(
          async (url) => {
            this.requests.push(url.slice("https://cdn".length));
            if (this.held && zone === this.held.zone) await this.held.gate;
            if (this.offline) throw new TypeError("Network request failed");
            const body = this.served.get(url.slice("https://cdn".length));
            return { status: body ? 200 : 403, text: async () => body ?? "" };
          },
          "https://cdn",
          zone,
          date,
        ),
      now: () => this.clock,
      deviceTz: "Europe/Stockholm",
      setTimer: (run, ms) => (this.timer = { run, ms }),
      clearTimer: () => (this.timer = null),
      warn: (message) => this.warnings.push(message),
    });
  }

  hold(zone: CoveredZoneCode) {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    this.held = { zone, release, gate };
  }

  serve(zone: CoveredZoneCode, date: string) {
    this.served.set(
      `/v1/prices/${zone}/${date}.json`,
      JSON.stringify(readFixture(zone, date)),
    );
  }

  // Moves the clock to the scheduled wake and runs it.
  async wake() {
    assert.ok(this.timer, "a wake is scheduled");
    const { run, ms } = this.timer;
    this.clock += ms;
    run();
    await settle();
  }

  // The delay of the scheduled wake, if any.
  delay() {
    return this.timer?.ms;
  }

  status(date: string) {
    return this.store.getState().days[date]?.status;
  }

  async confirm(zone: ZoneCode) {
    await this.store.start();
    await this.store.setZone(zone);
  }
}

test("first run guesses the zone from the device and fetches nothing", async () => {
  const h = new Harness("2026-10-26T10:00:00Z");
  await h.store.start();
  const s = h.store.getState();
  assert.equal(s.ready, true);
  assert.equal(s.zone, null);
  assert.deepEqual(s.guess, {
    preselected: "SE3",
    options: ["SE1", "SE2", "SE3", "SE4"],
  });
  assert.deepEqual(h.requests, []);
});

test("before 13:00 Berlin today and yesterday are fetched, then cached with the zone", async () => {
  const h = new Harness("2026-10-26T10:02:00Z");
  h.serve("SE3", "2026-10-25");
  h.serve("SE3", "2026-10-26");
  await h.confirm("SE3");
  const s = h.store.getState();
  assert.equal(s.zone, "SE3");
  assert.equal(s.yesterday, "2026-10-25");
  assert.equal(s.today, "2026-10-26");
  assert.equal(s.tomorrowFrom, Date.parse("2026-10-26T12:00:00Z"));
  assert.deepEqual(h.requests, [
    "/v1/prices/SE3/2026-10-26.json",
    "/v1/prices/SE3/2026-10-25.json",
  ]);
  assert.equal(h.status("2026-10-25"), "ok");
  assert.equal(h.status("2026-10-26"), "ok");
  assert.equal(h.status("2026-10-27"), "idle");
  assert.equal(h.storage.map.get("wattnot:v1:zone"), "SE3");
  assert.ok(h.storage.map.has("wattnot:v1:day:SE3:2026-10-26"));
  // The ticker wakes on the next quarter.
  assert.equal(h.delay(), 13 * MIN);
});

test("a relaunch reads the zone and today from disk and fetches nothing", async () => {
  const first = new Harness("2026-10-26T10:02:00Z");
  first.serve("SE3", "2026-10-25");
  first.serve("SE3", "2026-10-26");
  await first.confirm("SE3");
  const h = new Harness("2026-10-26T11:40:00Z", first.storage);
  await h.store.start();
  const today = h.store.getState().days["2026-10-26"];
  assert.equal(today.status, "ok");
  assert.equal(
    today.status === "ok" && today.fetchedAt,
    Date.parse("2026-10-26T10:02:00Z"),
  );
  assert.deepEqual(h.requests, []);
});

test("tomorrow retries 15 minutes after each attempt until it is published", async () => {
  const h = new Harness("2026-10-26T12:05:00Z");
  h.serve("SE3", "2026-10-25");
  h.serve("SE3", "2026-10-26");
  await h.confirm("SE3");
  assert.equal(h.status("2026-10-27"), "not-published");
  // 12:15 is the next quarter: it moves now, too early for a retry.
  assert.equal(h.delay(), 10 * MIN);
  await h.wake();
  assert.equal(h.store.getState().now, Date.parse("2026-10-26T12:15:00Z"));
  assert.equal(h.requests.length, 3);
  // 12:20 is 15 minutes after the attempt, before the 12:30 quarter.
  assert.equal(h.delay(), 5 * MIN);
  h.serve("SE3", "2026-10-27");
  await h.wake();
  assert.equal(h.requests.at(-1), "/v1/prices/SE3/2026-10-27.json");
  assert.equal(h.status("2026-10-27"), "ok");
  assert.equal(h.delay(), 10 * MIN);
});

test("pull to refresh skips the spacing of tomorrow", async () => {
  const h = new Harness("2026-10-26T12:05:00Z");
  h.serve("SE3", "2026-10-26");
  await h.confirm("SE3");
  h.serve("SE3", "2026-10-27");
  h.clock += 2 * MIN;
  const seen: boolean[] = [];
  h.store.subscribe(() => seen.push(h.store.getState().refreshing));
  await h.store.refresh();
  assert.equal(h.status("2026-10-27"), "ok");
  assert.equal(seen[0], true);
  assert.equal(h.store.getState().refreshing, false);
});

test("offline today is reported and fetched again on the next tick", async () => {
  const h = new Harness("2026-10-26T10:02:00Z");
  h.serve("SE3", "2026-10-26");
  h.offline = true;
  await h.confirm("SE3");
  assert.deepEqual(h.store.getState().days["2026-10-26"], {
    status: "offline",
    error: "TypeError: Network request failed",
  });
  h.offline = false;
  await h.wake();
  assert.equal(h.status("2026-10-26"), "ok");
});

test("a payload for another day is invalid and never cached", async () => {
  const h = new Harness("2026-10-26T10:02:00Z");
  h.served.set(
    "/v1/prices/SE3/2026-10-26.json",
    JSON.stringify(readFixture("SE3", "2026-10-27")),
  );
  await h.confirm("SE3");
  assert.equal(h.status("2026-10-26"), "invalid");
  assert.ok(!h.storage.map.has("wattnot:v1:day:SE3:2026-10-26"));
});

test("at local midnight tomorrow becomes today and the disk keeps yesterday on", async () => {
  const h = new Harness("2026-10-26T22:50:00Z");
  h.serve("SE3", "2026-10-26");
  h.serve("SE3", "2026-10-27");
  h.storage.map.set("wattnot:v1:day:SE3:2026-10-24", "old");
  h.storage.map.set("wattnot:v1:day:SE3:2026-10-25", "old");
  await h.confirm("SE3");
  // Today, tomorrow, and yesterday, which the CDN does not have.
  assert.equal(h.requests.length, 3);
  assert.equal(h.status("2026-10-25"), "not-published");
  // 23:00 UTC is midnight in Stockholm.
  await h.wake();
  const s = h.store.getState();
  assert.equal(s.yesterday, "2026-10-26");
  assert.equal(s.today, "2026-10-27");
  assert.deepEqual(Object.keys(s.days).sort(), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
  ]);
  assert.equal(h.status("2026-10-26"), "ok");
  assert.equal(h.status("2026-10-27"), "ok");
  assert.equal(h.requests.length, 3);
  assert.deepEqual(
    [...h.storage.map.keys()].filter((k) => k.includes(":day:")).sort(),
    ["wattnot:v1:day:SE3:2026-10-26", "wattnot:v1:day:SE3:2026-10-27"],
  );
});

test("a zone change drops the late result of the previous zone", async () => {
  const h = new Harness("2026-10-26T10:02:00Z");
  h.serve("SE3", "2026-10-26");
  h.hold("SE3");
  await h.store.start();
  const se3 = h.store.setZone("SE3");
  await settle();
  assert.deepEqual(h.requests, [
    "/v1/prices/SE3/2026-10-26.json",
    "/v1/prices/SE3/2026-10-25.json",
  ]);
  assert.equal(h.status("2026-10-26"), "loading");
  await h.store.setZone("DK1");
  assert.equal(h.status("2026-10-26"), "not-published");
  h.held?.release();
  await se3;
  assert.equal(h.store.getState().zone, "DK1");
  assert.equal(h.status("2026-10-26"), "not-published");
  assert.ok(!h.storage.map.has("wattnot:v1:day:SE3:2026-10-26"));
});

test("an uncovered zone fetches nothing", async () => {
  const h = new Harness("2026-10-26T12:30:00Z");
  await h.confirm("FI");
  assert.deepEqual(h.requests, []);
  assert.equal(h.status("2026-10-25"), "idle");
  assert.equal(h.status("2026-10-26"), "idle");
  assert.equal(h.status("2026-10-27"), "idle");
});

test("stop clears the ticker and start ticks again", async () => {
  const h = new Harness("2026-10-26T10:02:00Z");
  h.serve("SE3", "2026-10-25");
  h.serve("SE3", "2026-10-26");
  await h.confirm("SE3");
  h.store.stop();
  assert.equal(h.timer, null);
  h.clock = Date.parse("2026-10-26T12:31:00Z");
  await h.store.start();
  assert.equal(h.store.getState().now, h.clock);
  assert.equal(h.requests.at(-1), "/v1/prices/SE3/2026-10-27.json");
  assert.equal(h.delay(), 14 * MIN);
});
