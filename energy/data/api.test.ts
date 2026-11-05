import assert from "node:assert/strict";
import { test } from "node:test";

import { readFixture } from "../lib/fixtures/load.ts";
import {
  dayUrl,
  fetchDay,
  pruneCache,
  readCachedDay,
  readZone,
  writeCachedDay,
  writeZone,
  type HttpGet,
} from "./api.ts";
import { memoryStorage } from "./fakes.ts";

const BASE = "https://example.test/";

// One canned response, and the URLs requested.
function http(status: number, body = ""): HttpGet & { urls: string[] } {
  const urls: string[] = [];
  const get = async (url: string) => {
    urls.push(url);
    return { status, text: async () => body };
  };
  return Object.assign(get, { urls });
}

const SE3_27 = JSON.stringify(readFixture("SE3", "2026-10-27"));

test("a valid object is ok, from the zone and date path", async () => {
  const get = http(200, SE3_27);
  const outcome = await fetchDay(get, BASE, "SE3", "2026-10-27");
  assert.equal(outcome.status, "ok");
  assert.equal(
    outcome.status === "ok" && outcome.payload.prices_eur_mwh.length,
    96,
  );
  assert.deepEqual(get.urls, [
    "https://example.test/v1/prices/SE3/2026-10-27.json",
  ]);
  assert.equal(
    dayUrl("https://h", "PL", "2026-03-29"),
    "https://h/v1/prices/PL/2026-03-29.json",
  );
});

test("403 and 404 mean not published, other statuses offline", async () => {
  for (const status of [403, 404]) {
    const outcome = await fetchDay(http(status), BASE, "SE3", "2026-10-27");
    assert.deepEqual(outcome, { status: "not-published" });
  }
  const outcome = await fetchDay(http(503), BASE, "SE3", "2026-10-27");
  assert.deepEqual(outcome, { status: "offline", error: "HTTP 503" });
});

test("a transport failure is offline", async () => {
  const get: HttpGet = async () => {
    throw new TypeError("Network request failed");
  };
  const outcome = await fetchDay(get, BASE, "SE3", "2026-10-27");
  assert.deepEqual(outcome, {
    status: "offline",
    error: "TypeError: Network request failed",
  });
});

test("one timeout covers the request and the body", async () => {
  // Headers arrive at once, the body never does until the abort.
  const get: HttpGet = async (_url, signal) => ({
    status: 200,
    text: () =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  });
  const outcome = await fetchDay(get, BASE, "SE3", "2026-10-27", 20);
  assert.deepEqual(outcome, {
    status: "offline",
    error: "timed out after 20 ms",
  });
});

test("a body that is not JSON or not the requested day is invalid", async () => {
  const notJson = await fetchDay(
    http(200, "<html>"),
    BASE,
    "SE3",
    "2026-10-27",
  );
  assert.deepEqual(notJson, { status: "invalid", error: "body is not JSON" });
  const otherDay = await fetchDay(http(200, SE3_27), BASE, "SE3", "2026-10-26");
  assert.equal(otherDay.status, "invalid");
  assert.match(
    otherDay.status === "invalid" ? otherDay.error : "",
    /date 2026-10-27/,
  );
});

test("the disk cache round-trips and revalidates each entry", async () => {
  const storage = memoryStorage();
  assert.equal(await readCachedDay(storage, "SE3", "2026-10-27"), null);
  const payload = JSON.parse(SE3_27);
  await writeCachedDay(storage, "SE3", "2026-10-27", {
    payload,
    fetchedAt: 42,
  });
  const cached = await readCachedDay(storage, "SE3", "2026-10-27");
  assert.equal(cached?.fetchedAt, 42);
  assert.deepEqual(cached?.payload, payload);
  // The same entry read as another day, then a broken entry: both absent.
  storage.map.set(
    "wattnot:v1:day:SE3:2026-10-26",
    storage.map.get("wattnot:v1:day:SE3:2026-10-27")!,
  );
  assert.equal(await readCachedDay(storage, "SE3", "2026-10-26"), null);
  storage.map.set("wattnot:v1:day:SE3:2026-10-27", "{");
  assert.equal(await readCachedDay(storage, "SE3", "2026-10-27"), null);
});

test("pruning removes the days of every zone before the given date only", async () => {
  const storage = memoryStorage();
  for (const key of [
    "wattnot:v1:day:SE3:2026-10-24",
    "wattnot:v1:day:DK1:2026-10-25",
    "wattnot:v1:day:SE3:2026-10-26",
    "wattnot:v1:zone",
    "legacy-key",
  ])
    storage.map.set(key, "x");
  await pruneCache(storage, "2026-10-26");
  assert.deepEqual(
    [...storage.map.keys()],
    ["wattnot:v1:day:SE3:2026-10-26", "wattnot:v1:zone", "legacy-key"],
  );
});

test("the stored zone is read back, and junk reads as none", async () => {
  const storage = memoryStorage();
  assert.equal(await readZone(storage), null);
  await writeZone(storage, "NO2");
  assert.equal(await readZone(storage), "NO2");
  storage.map.set("wattnot:v1:zone", "XX");
  assert.equal(await readZone(storage), null);
});
