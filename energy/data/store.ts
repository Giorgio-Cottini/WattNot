// The app's one data store (PLAN.md section 4): the zone, its yesterday, today
// and tomorrow, and the outcome of each day. Disk first, then network, as lib/refresh.ts plans.
// A foreground ticker moves "now" every quarter and wakes the retry of tomorrow.
// Nothing runs in the background: the binding stops the ticker there.

import type { DayPayload } from "../lib/payload.ts";
import {
  TOMORROW_RETRY_MS,
  planRefresh,
  type RefreshPlan,
} from "../lib/refresh.ts";
import { MINUTE_MS, addDays, localDate } from "../lib/time.ts";
import {
  ZONES,
  inferZone,
  type CoveredZone,
  type CoveredZoneCode,
  type Zone,
  type ZoneCode,
  type ZoneGuess,
} from "../lib/zones.ts";
import {
  pruneCache,
  readCachedDay,
  readZone,
  writeCachedDay,
  writeZone,
  type FetchOutcome,
  type KeyValueStorage,
} from "./api.ts";

// Every zone's offset is a whole number of quarters, so a UTC quarter boundary is
// a local one.
const QUARTER_MS = 15 * MINUTE_MS;

export type DayOutcome =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; payload: DayPayload; fetchedAt: number }
  | { status: "not-published" }
  | { status: "offline"; error: string }
  | { status: "invalid"; error: string };

export interface DataState {
  // False until the stored zone has been read.
  ready: boolean;
  // Null on first run, until the user confirms a zone (D20).
  zone: ZoneCode | null;
  // The first run guess from the device time zone, null once a zone is set.
  guess: ZoneGuess | null;
  // The instant of the last tick.
  now: number;
  // Local dates of the zone, and 13:00 Berlin on today. Null without a zone.
  yesterday: string | null;
  today: string | null;
  tomorrow: string | null;
  tomorrowFrom: number | null;
  // Outcome per local date: yesterday, today and tomorrow.
  days: Readonly<Record<string, DayOutcome>>;
  // A pull to refresh is in flight.
  refreshing: boolean;
}

export interface StoreDeps {
  storage: KeyValueStorage;
  fetchDay(zone: CoveredZoneCode, date: string): Promise<FetchOutcome>;
  now(): number;
  deviceTz: string | undefined;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  // Disk failures fall back to the network, so they only log.
  warn(message: string): void;
}

export interface DataStore {
  getState(): DataState;
  subscribe(listener: () => void): () => void;
  // On launch and on AppState active: read the zone once, then tick.
  start(): Promise<void>;
  // In the background: no ticker, no fetch.
  stop(): void;
  setZone(zone: ZoneCode): Promise<void>;
  // Pull to refresh: skips the 15 minute spacing of tomorrow.
  refresh(): Promise<void>;
}

export function createDataStore(deps: StoreDeps): DataStore {
  let state: DataState = {
    ready: false,
    zone: null,
    guess: null,
    now: deps.now(),
    yesterday: null,
    today: null,
    tomorrow: null,
    tomorrowFrom: null,
    days: {},
    refreshing: false,
  };
  const listeners = new Set<() => void>();
  let lastAttempt: Record<string, number> = {};
  const inFlight = new Set<string>();
  // Bumped by a zone change: results of the previous zone are dropped.
  let generation = 0;
  let zoneRead: Promise<void> | null = null;
  // The disk read of one zone and local day, shared by concurrent ticks.
  let dayRead: { key: string; done: Promise<void> } | null = null;
  let running = false;
  let timer: unknown = null;

  function set(patch: Partial<DataState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function setDay(date: string, outcome: DayOutcome): void {
    set({ days: { ...state.days, [date]: outcome } });
  }

  async function readStoredZone(): Promise<void> {
    const zone = await readZone(deps.storage);
    set({ ready: true, zone, guess: zone ? null : inferZone(deps.deviceTz) });
  }

  async function readDisk(
    zone: Zone,
    dates: string[],
    gen: number,
  ): Promise<void> {
    if (!zone.covered) return;
    await Promise.all(
      dates.map(async (date) => {
        const cached = await readCachedDay(deps.storage, zone.code, date).catch(
          (error: unknown) => {
            deps.warn(`cache read ${zone.code} ${date}: ${String(error)}`);
            return null;
          },
        );
        const current = state.days[date];
        if (
          cached &&
          gen === generation &&
          current &&
          current.status !== "ok"
        ) {
          setDay(date, { status: "ok", ...cached });
        }
      }),
    );
    // dates[0] is yesterday: every older day goes.
    await pruneCache(deps.storage, dates[0]).catch((error: unknown) =>
      deps.warn(`cache prune: ${String(error)}`),
    );
  }

  async function fetchDate(
    zone: CoveredZone,
    date: string,
    gen: number,
    now: number,
  ) {
    const key = `${zone.code}:${date}`;
    inFlight.add(key);
    lastAttempt[date] = now;
    // A retry keeps the previous outcome on screen instead of flashing "loading".
    if (state.days[date]?.status === "idle")
      setDay(date, { status: "loading" });
    let outcome: FetchOutcome;
    try {
      outcome = await deps.fetchDay(zone.code, date);
    } finally {
      inFlight.delete(key);
    }
    if (gen !== generation || !(date in state.days)) return;
    if (outcome.status !== "ok") return setDay(date, outcome);
    const entry = { payload: outcome.payload, fetchedAt: deps.now() };
    setDay(date, { status: "ok", ...entry });
    await writeCachedDay(deps.storage, zone.code, date, entry).catch(
      (error: unknown) =>
        deps.warn(`cache write ${zone.code} ${date}: ${String(error)}`),
    );
  }

  // Next wake: the next quarter boundary, or the retry of tomorrow if sooner.
  function schedule(now: number, plan: RefreshPlan, zone: Zone): void {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    if (!running) return;
    let next = Math.floor(now / QUARTER_MS) * QUARTER_MS + QUARTER_MS;
    const last = lastAttempt[plan.tomorrow];
    const waiting =
      zone.covered &&
      now >= plan.tomorrowFrom &&
      state.days[plan.tomorrow]?.status !== "ok";
    if (waiting && last !== undefined) {
      next = Math.min(next, Math.max(last + TOMORROW_RETRY_MS, now));
    }
    timer = deps.setTimer(() => void tick(), next - now);
  }

  async function tick(force = false): Promise<void> {
    const gen = generation;
    const now = deps.now();
    if (state.zone === null) return set({ now });
    const zone = ZONES[state.zone];
    // The zone's calendar, never the device's.
    const today = localDate(now, zone.tz);
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const key = `${zone.code}:${today}`;
    if (dayRead?.key !== key) {
      // A new zone or a new local day: the days already held carry over, so at
      // midnight today becomes yesterday and tomorrow becomes today.
      const days: Record<string, DayOutcome> = {
        [yesterday]: state.days[yesterday] ?? { status: "idle" },
        [today]: state.days[today] ?? { status: "idle" },
        [tomorrow]: state.days[tomorrow] ?? { status: "idle" },
      };
      lastAttempt = Object.fromEntries(
        Object.entries(lastAttempt).filter(([date]) => date in days),
      );
      set({ now, yesterday, today, tomorrow, days });
      dayRead = {
        key,
        done: readDisk(zone, [yesterday, today, tomorrow], gen),
      };
    } else {
      set({ now });
    }
    await dayRead.done;
    if (gen !== generation) return;

    const cached = new Set(
      Object.keys(state.days).filter(
        (date) => state.days[date].status === "ok",
      ),
    );
    const plan = planRefresh({ now, zone, cached, lastAttempt, force });
    set({ tomorrowFrom: plan.tomorrowFrom });
    // fetchDate records its attempt before its first await, so schedule sees it.
    const fetches = zone.covered
      ? plan.fetch
          .filter((date) => !inFlight.has(`${zone.code}:${date}`))
          .map((date) => fetchDate(zone, date, gen, now))
      : [];
    schedule(now, plan, zone);
    await Promise.all(fetches);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      running = true;
      zoneRead ??= readStoredZone();
      await zoneRead;
      await tick();
    },
    stop() {
      running = false;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
    async setZone(zone) {
      generation += 1;
      lastAttempt = {};
      dayRead = null;
      set({
        zone,
        guess: null,
        yesterday: null,
        today: null,
        tomorrow: null,
        tomorrowFrom: null,
        days: {},
      });
      await writeZone(deps.storage, zone);
      await tick();
    },
    async refresh() {
      set({ refreshing: true });
      try {
        await tick(true);
      } finally {
        set({ refreshing: false });
      }
    },
  };
}
