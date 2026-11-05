import assert from "node:assert/strict";
import { test } from "node:test";

import { ZONES, ZONE_LIST, inferZone, isZoneCode } from "./zones.ts";

test("8 covered and 9 uncovered zones, as in PLAN.md section 2", () => {
  const covered = ZONE_LIST.filter((z) => z.covered).map((z) => z.code);
  const uncovered = ZONE_LIST.filter((z) => !z.covered).map((z) => z.code);
  assert.deepEqual(covered, [
    "GER",
    "DK1",
    "DK2",
    "NO2",
    "SE3",
    "SE4",
    "NL",
    "PL",
  ]);
  assert.deepEqual(uncovered, [
    "FI",
    "EE",
    "LV",
    "NO1",
    "NO3",
    "NO4",
    "NO5",
    "SE1",
    "SE2",
  ]);
  assert.equal(Object.keys(ZONES).length, 17);
});

test("covered zones carry tz, currency, subunit and credit", () => {
  const rows = ZONE_LIST.filter((z) => z.covered).map((z) => [
    z.code,
    z.tz,
    z.currency,
    z.subunit,
    z.covered && z.credit.split(" ")[1],
  ]);
  assert.deepEqual(rows, [
    ["GER", "Europe/Berlin", "EUR", "c", "Energinet"],
    ["DK1", "Europe/Copenhagen", "DKK", "øre", "Energinet"],
    ["DK2", "Europe/Copenhagen", "DKK", "øre", "Energinet"],
    ["NO2", "Europe/Oslo", "NOK", "øre", "Energinet"],
    ["SE3", "Europe/Stockholm", "SEK", "öre", "Energinet"],
    ["SE4", "Europe/Stockholm", "SEK", "öre", "Energinet"],
    ["NL", "Europe/Amsterdam", "EUR", "c", "Bundesnetzagentur"],
    ["PL", "Europe/Warsaw", "PLN", "gr", "Bundesnetzagentur"],
  ]);
});

test("uncovered zones link to Nord Pool's page for their area", () => {
  const fi = ZONES.FI;
  assert.equal(fi.covered, false);
  assert.equal(
    !fi.covered && fi.link,
    "https://data.nordpoolgroup.com/auction/day-ahead/prices?deliveryDate=latest" +
      "&currency=EUR&aggregation=DeliveryPeriod&deliveryAreas=FI",
  );
  const se2 = ZONES.SE2;
  assert.ok(!se2.covered && se2.link.endsWith("&deliveryAreas=SE2"));
  assert.equal(se2.tz, "Europe/Stockholm");
  assert.equal(ZONES.EE.tz, "Europe/Tallinn");
});

test("zone codes are checked", () => {
  assert.equal(isZoneCode("SE3"), true);
  assert.equal(isZoneCode("FI"), true);
  assert.equal(isZoneCode("DE"), false);
  assert.equal(isZoneCode("constructor"), false);
  assert.equal(isZoneCode(null), false);
});

test("the device time zone gives the zone directly for GER, NL and PL", () => {
  assert.deepEqual(inferZone("Europe/Berlin"), {
    preselected: "GER",
    options: ["GER"],
  });
  assert.deepEqual(inferZone("Europe/Luxembourg"), {
    preselected: "GER",
    options: ["GER"],
  });
  assert.deepEqual(inferZone("Europe/Amsterdam"), {
    preselected: "NL",
    options: ["NL"],
  });
  assert.deepEqual(inferZone("Europe/Warsaw"), {
    preselected: "PL",
    options: ["PL"],
  });
});

test("SE, NO and DK ask, preselecting their most populous covered zone", () => {
  assert.deepEqual(inferZone("Europe/Stockholm"), {
    preselected: "SE3",
    options: ["SE1", "SE2", "SE3", "SE4"],
  });
  assert.deepEqual(inferZone("Europe/Oslo"), {
    preselected: "NO2",
    options: ["NO1", "NO2", "NO3", "NO4", "NO5"],
  });
  assert.deepEqual(inferZone("Europe/Copenhagen"), {
    preselected: "DK1",
    options: ["DK1", "DK2"],
  });
});

test("FI, EE and LV map to their uncovered zone; other zones give no guess", () => {
  assert.equal(inferZone("Europe/Helsinki")?.preselected, "FI");
  assert.equal(inferZone("Europe/Tallinn")?.preselected, "EE");
  assert.equal(inferZone("Europe/Riga")?.preselected, "LV");
  assert.equal(inferZone("America/New_York"), null);
  assert.equal(inferZone("constructor"), null);
  assert.equal(inferZone(undefined), null);
});

test("the screen shows the public code, the data paths keep the key", () => {
  assert.equal(ZONES.GER.code, "GER");
  assert.equal(ZONES.GER.shownCode, "DE-LU");
  for (const z of ZONE_LIST.filter((z) => z.code !== "GER")) {
    assert.equal(z.shownCode, z.code);
  }
});
