// The v1 day object over HTTP and its disk cache (PLAN.md section 2). Every
// payload, from the network or from the disk, passes validatePayload before use.
// Storage and HTTP come in as arguments, so node tests run without React Native.

import { validatePayload, type DayPayload } from "../lib/payload.ts";
import {
  isZoneCode,
  type CoveredZoneCode,
  type ZoneCode,
} from "../lib/zones.ts";

export const DEFAULT_BASE_URL = "https://d2bt4p7su60zys.cloudfront.net";
export const FETCH_TIMEOUT_MS = 8_000;

export type FetchOutcome =
  | { status: "ok"; payload: DayPayload }
  | { status: "not-published" }
  | { status: "offline"; error: string }
  | { status: "invalid"; error: string };

export interface HttpResponse {
  status: number;
  text(): Promise<string>;
}

export type HttpGet = (
  url: string,
  signal: AbortSignal,
) => Promise<HttpResponse>;

// The subset of AsyncStorage the cache uses.
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export interface CachedDay {
  payload: DayPayload;
  // When the payload arrived from the network, for "Last updated" (D28).
  fetchedAt: number;
}

const DAY_PREFIX = "wattnot:v1:day:";
const ZONE_KEY = "wattnot:v1:zone";

export function dayUrl(
  baseUrl: string,
  zone: CoveredZoneCode,
  date: string,
): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/prices/${zone}/${date}.json`;
}

// One timeout covers the request and the body. CloudFront answers 403 for a day
// that does not exist yet (OAC without ListBucket), S3 behind another setup 404.
export async function fetchDay(
  get: HttpGet,
  baseUrl: string,
  zone: CoveredZoneCode,
  date: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status: number;
  let body: string;
  try {
    const response = await get(dayUrl(baseUrl, zone, date), controller.signal);
    status = response.status;
    body = await response.text();
  } catch (error) {
    const reason = controller.signal.aborted
      ? `timed out after ${timeoutMs} ms`
      : String(error);
    return { status: "offline", error: reason };
  } finally {
    clearTimeout(timer);
  }
  if (status === 403 || status === 404) return { status: "not-published" };
  if (status !== 200) return { status: "offline", error: `HTTP ${status}` };
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { status: "invalid", error: "body is not JSON" };
  }
  const result = validatePayload(raw, { zone, date });
  return result.ok
    ? { status: "ok", payload: result.payload }
    : { status: "invalid", error: result.error };
}

function dayKey(zone: CoveredZoneCode, date: string): string {
  return `${DAY_PREFIX}${zone}:${date}`;
}

// Null when the day is not on disk. An entry that no longer validates, after an
// app update for example, counts as absent and is fetched again.
export async function readCachedDay(
  storage: KeyValueStorage,
  zone: CoveredZoneCode,
  date: string,
): Promise<CachedDay | null> {
  const text = await storage.getItem(dayKey(zone, date));
  if (text === null) return null;
  let entry: unknown;
  try {
    entry = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof entry !== "object" || entry === null) return null;
  const { payload, fetchedAt } = entry as Record<string, unknown>;
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt)) return null;
  const result = validatePayload(payload, { zone, date });
  return result.ok ? { payload: result.payload, fetchedAt } : null;
}

export async function writeCachedDay(
  storage: KeyValueStorage,
  zone: CoveredZoneCode,
  date: string,
  entry: CachedDay,
): Promise<void> {
  await storage.setItem(dayKey(zone, date), JSON.stringify(entry));
}

// Removes the cached days of every zone dated before `oldest`.
export async function pruneCache(
  storage: KeyValueStorage,
  oldest: string,
): Promise<void> {
  const keys = await storage.getAllKeys();
  // The key ends in YYYY-MM-DD, which orders as text.
  const stale = keys.filter(
    (key) => key.startsWith(DAY_PREFIX) && key.slice(-10) < oldest,
  );
  if (stale.length > 0) await storage.multiRemove(stale);
}

export async function readZone(
  storage: KeyValueStorage,
): Promise<ZoneCode | null> {
  const code = await storage.getItem(ZONE_KEY);
  return isZoneCode(code) ? code : null;
}

export async function writeZone(
  storage: KeyValueStorage,
  zone: ZoneCode,
): Promise<void> {
  await storage.setItem(ZONE_KEY, zone);
}
