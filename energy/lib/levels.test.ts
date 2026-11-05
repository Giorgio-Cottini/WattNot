import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LEVEL_WORD,
  ROLE_WORD,
  ZERO_OR_NEGATIVE_WORD,
  isZeroOrNegative,
  levelOf,
  roleOf,
  veryExpensiveCut,
} from "./levels.ts";

const cuts = { p25: 41.2, p75: 96.7, window_days: 7 };

test("three levels cut at P25 and P75, the cut points are normal", () => {
  assert.equal(levelOf(-5, cuts), "cheap");
  assert.equal(levelOf(41.19, cuts), "cheap");
  assert.equal(levelOf(41.2, cuts), "normal");
  assert.equal(levelOf(70, cuts), "normal");
  assert.equal(levelOf(96.7, cuts), "normal");
  assert.equal(levelOf(96.71, cuts), "expensive");
});

test("very expensive above the upper Tukey fence, the fence is expensive", () => {
  // 96.7 + 1.5 * (96.7 - 41.2) = 179.95
  assert.equal(veryExpensiveCut(cuts), 96.7 + 1.5 * (96.7 - 41.2));
  assert.equal(levelOf(150, cuts), "expensive");
  assert.equal(levelOf(veryExpensiveCut(cuts), cuts), "expensive");
  assert.equal(levelOf(179.96, cuts), "veryExpensive");
  assert.equal(levelOf(500, cuts), "veryExpensive");
});

test("a flat week puts the fence on P75", () => {
  const flat = { p25: 50, p75: 50, window_days: 7 };
  assert.equal(levelOf(50, flat), "normal");
  assert.equal(levelOf(50.01, flat), "veryExpensive");
});

test("null levels give no level", () => {
  assert.equal(levelOf(70, null), null);
  assert.equal(levelOf(-70, null), null);
});

test("zero or negative comes from the price itself", () => {
  assert.equal(isZeroOrNegative(0), true);
  assert.equal(isZeroOrNegative(-0.01), true);
  assert.equal(isZeroOrNegative(0.01), false);
  // Weeks near zero: P25 can be negative, and a zero price is then normal.
  const low = { p25: -3, p75: 12, window_days: 7 };
  assert.equal(levelOf(0, low), "normal");
  assert.equal(isZeroOrNegative(0), true);
});

test("the marker wins over the level on a coloured surface", () => {
  assert.equal(roleOf("cheap", true), "zeroOrNegative");
  assert.equal(roleOf(null, true), "zeroOrNegative");
  assert.equal(roleOf("normal", false), "normal");
  assert.equal(roleOf(null, false), null);
});

test("one word per level and role, and no 'free'", () => {
  assert.deepEqual(Object.values(LEVEL_WORD), [
    "Cheap",
    "Normal",
    "Expensive",
    "Very expensive",
  ]);
  assert.equal(ZERO_OR_NEGATIVE_WORD, "Zero or negative");
  assert.equal(ROLE_WORD.zeroOrNegative, "Zero or negative");
  for (const word of Object.values(ROLE_WORD))
    assert.doesNotMatch(word, /free/i);
});
