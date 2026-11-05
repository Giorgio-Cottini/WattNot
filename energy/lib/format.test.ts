import assert from "node:assert/strict";
import { test } from "node:test";

import { loadPayload } from "./fixtures/load.ts";
import {
  formatAmount,
  formatPrice,
  isConverted,
  sourceNotes,
  toSubunitPerKwh,
  unitLabel,
} from "./format.ts";
import { ZONES } from "./zones.ts";

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("EUR/MWh to the local subunit per kWh is eur_mwh * rate / 10", () => {
  close(toSubunitPerKwh(17.75, 11.1834), 19.850535);
  close(toSubunitPerKwh(87.53, 1), 8.753);
  close(toSubunitPerKwh(-44.25, 7.4612), -33.01581);
  assert.equal(toSubunitPerKwh(0, 11.1834), 0);
});

test("units are the local subunit per kWh", () => {
  assert.deepEqual(
    ["GER", "NL", "DK1", "DK2", "NO2", "SE3", "SE4", "PL"].map((c) =>
      unitLabel(ZONES[c as keyof typeof ZONES]),
    ),
    [
      "c/kWh",
      "c/kWh",
      "øre/kWh",
      "øre/kWh",
      "øre/kWh",
      "öre/kWh",
      "öre/kWh",
      "gr/kWh",
    ],
  );
});

test("2 decimals by the locale", () => {
  assert.equal(formatAmount(19.850535, "en-GB"), "19.85");
  assert.equal(formatAmount(8.753, "en-GB"), "8.75");
  assert.equal(formatAmount(-4.4251, "en-GB"), "-4.43");
  assert.equal(formatAmount(3, "en-GB"), "3.00");
  assert.equal(formatAmount(1234.5, "de-DE"), "1.234,50");
});

test("converted currencies carry ≈, EUR does not", () => {
  assert.equal(formatPrice(19.850535, ZONES.SE3, "en-GB"), "≈ 19.85 öre/kWh");
  assert.equal(formatPrice(8.753, ZONES.GER, "en-GB"), "8.75 c/kWh");
  assert.equal(formatPrice(-33.01581, ZONES.DK1, "en-GB"), "≈ -33.02 øre/kWh");
  assert.equal(formatPrice(51.2, ZONES.PL, "en-GB"), "≈ 51.20 gr/kWh");
  assert.equal(isConverted(ZONES.NL), false);
  assert.equal(isConverted(ZONES.NO2), true);
});

test("source notes: the day's credit, the change note, the ECB line", () => {
  const today = { payload: loadPayload("SE3", "2026-10-27"), label: "today" };
  assert.deepEqual(sourceNotes([today], "en-GB"), [
    "Source: Energinet (www.energidataservice.dk), CC BY 4.0.",
    "Converted from EUR/MWh to öre/kWh by WattNot at the ECB reference rate of 23 Oct 2026.",
    "Exchange rate: European Central Bank reference rate.",
  ]);
  // GER served by its SMARD fallback: the payload's credit wins over the zone's.
  const ger = { payload: loadPayload("GER", "2026-03-29"), label: "today" };
  assert.deepEqual(sourceNotes([ger], "en-GB"), [
    "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0.",
    "Converted from EUR/MWh to c/kWh by WattNot.",
  ]);
  assert.deepEqual(sourceNotes([], "en-GB"), []);
});

test("two days print each note once, and name two rate dates", () => {
  const today = { payload: loadPayload("SE3", "2026-10-26"), label: "today" };
  const tomorrow = {
    payload: loadPayload("SE3", "2026-10-27"),
    label: "tomorrow",
  };
  // Both carry the rate of 23 Oct: one sentence, no day names.
  assert.deepEqual(sourceNotes([today, tomorrow], "en-GB"), [
    "Source: Energinet (www.energidataservice.dk), CC BY 4.0.",
    "Converted from EUR/MWh to öre/kWh by WattNot at the ECB reference rate of 23 Oct 2026.",
    "Exchange rate: European Central Bank reference rate.",
  ]);
  const later = {
    payload: loadPayload("SE3", "2026-10-27", (raw) => {
      (raw.fx as Record<string, unknown>).date = "2026-10-26";
      (raw.source as Record<string, unknown>).credit =
        "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0.";
    }),
    label: "tomorrow",
  };
  assert.deepEqual(sourceNotes([today, later], "en-GB"), [
    "Source: Energinet (www.energidataservice.dk), CC BY 4.0.",
    "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0.",
    "Converted from EUR/MWh to öre/kWh by WattNot at the ECB reference rate of 23 Oct 2026 (today) and 26 Oct 2026 (tomorrow).",
    "Exchange rate: European Central Bank reference rate.",
  ]);
});
