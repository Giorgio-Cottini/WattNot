import assert from "node:assert/strict";
import { test } from "node:test";

import { readFixture } from "./fixtures/load.ts";
import { validatePayload } from "./payload.ts";
import type { CoveredZoneCode } from "./zones.ts";

process.env.TZ = "Asia/Tokyo";

type Raw = Record<string, unknown>;

function check(zone: CoveredZoneCode, date: string, edit?: (raw: Raw) => void) {
  const raw = readFixture(zone, date);
  edit?.(raw);
  return validatePayload(raw, { zone, date });
}

function rejects(
  zone: CoveredZoneCode,
  date: string,
  edit: (raw: Raw) => void,
  error: RegExp,
) {
  const result = check(zone, date, edit);
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : "", error);
}

test("valid days of 96, 100 and 92 slots pass", () => {
  for (const [zone, date] of [
    ["SE3", "2026-10-27"],
    ["SE3", "2026-10-25"],
    ["GER", "2026-03-29"],
    ["DK1", "2026-05-10"],
  ] as const) {
    const result = check(zone, date);
    assert.equal(
      result.ok,
      true,
      `${zone} ${date}: ${!result.ok && result.error}`,
    );
  }
});

test("non objects fail without throwing", () => {
  for (const raw of [null, undefined, "x", 1, [], [1]]) {
    const result = validatePayload(raw, { zone: "SE3", date: "2026-10-27" });
    assert.equal(result.ok, false);
  }
});

test("the slot count must equal the local day length", () => {
  rejects(
    "SE3",
    "2026-10-25",
    (r) => {
      r.prices_eur_mwh = (r.prices_eur_mwh as number[]).slice(0, 96);
    },
    /96 values, the day has 100 slots/,
  );
  rejects(
    "GER",
    "2026-03-29",
    (r) => {
      r.prices_eur_mwh = [...(r.prices_eur_mwh as number[]), 1, 2, 3, 4];
    },
    /96 values, the day has 92 slots/,
  );
});

test("every price is a finite number", () => {
  for (const bad of [null, "17.75", Infinity, NaN, undefined]) {
    rejects(
      "SE3",
      "2026-10-27",
      (r) => {
        (r.prices_eur_mwh as unknown[])[5] = bad;
      },
      /prices_eur_mwh\[5\]/,
    );
  }
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.prices_eur_mwh = "17.75";
    },
    /not an array/,
  );
});

test("fx is null exactly for EUR zones", () => {
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.fx = null;
    },
    /fx missing for SEK/,
  );
  rejects(
    "GER",
    "2026-03-29",
    (r) => {
      r.fx = { quote: "EUR", rate: 1, date: "2026-03-27", source: "ECB" };
    },
    /fx must be null for EUR/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      (r.fx as Raw).quote = "NOK";
    },
    /fx.quote NOK/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      (r.fx as Raw).rate = 0;
    },
    /fx.rate/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      (r.fx as Raw).date = "2026-10-32";
    },
    /fx.date/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      (r.fx as Raw).source = "Fed";
    },
    /fx.source/,
  );
});

test("header fields follow the contract and the request", () => {
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.schema = 2;
    },
    /schema 2/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.zone = "SE4";
    },
    /zone SE4 is not SE3/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.date = "2026-10-26";
    },
    /date 2026-10-26 is not 2026-10-27/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.tz = "Europe/Berlin";
    },
    /tz Europe\/Berlin/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.currency = "EUR";
    },
    /currency EUR is not SEK/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.interval_minutes = 60;
    },
    /interval_minutes 60/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.generated_at = "yesterday";
    },
    /generated_at/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      (r.source as Raw).credit = "";
    },
    /source/,
  );
});

test("start_utc is local midnight of the date, explicit UTC", () => {
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.start_utc = "2026-10-27T00:00:00Z";
    },
    /not local midnight/,
  );
  rejects(
    "SE3",
    "2026-10-25",
    (r) => {
      r.start_utc = "2026-10-24T23:00:00Z";
    },
    /not local midnight/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.start_utc = "2026-10-27T00:00:00+01:00";
    },
    /YYYY-MM-DDTHH:MM:SSZ/,
  );
});

test("levels are null or ordered cut points", () => {
  assert.equal(
    check("SE3", "2026-10-27", (r) => (r.levels_eur_mwh = null)).ok,
    true,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.levels_eur_mwh = { p25: 90, p75: 40, window_days: 7 };
    },
    /p25 exceeds p75/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.levels_eur_mwh = { p25: 40, window_days: 7 };
    },
    /p25 or p75/,
  );
  rejects(
    "SE3",
    "2026-10-27",
    (r) => {
      r.levels_eur_mwh = { p25: 40, p75: 90, window_days: 0 };
    },
    /window_days/,
  );
});

test("unknown keys are ignored", () => {
  const result = check("SE3", "2026-10-27", (r) => (r.extra = { peak: 1 }));
  assert.equal(result.ok, true);
});
