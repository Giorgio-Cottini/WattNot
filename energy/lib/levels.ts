// Price levels (D14) and the zero or negative marker (D15). One module for every
// coloured surface.

import type { LevelCuts } from "./payload.ts";

export type Level = "cheap" | "normal" | "expensive" | "veryExpensive";

export const LEVEL_WORD: Record<Level, string> = {
  cheap: "Cheap",
  normal: "Normal",
  expensive: "Expensive",
  veryExpensive: "Very expensive",
};

export const ZERO_OR_NEGATIVE_WORD = "Zero or negative";

// What a coloured surface shows: the marker wins over the level.
export type PriceRole = Level | "zeroOrNegative";

export const ROLE_WORD: Record<PriceRole, string> = {
  ...LEVEL_WORD,
  zeroOrNegative: ZERO_OR_NEGATIVE_WORD,
};

// The upper Tukey fence of the 7 day window: P75 + 1.5 * (P75 - P25).
export function veryExpensiveCut(cuts: LevelCuts): number {
  return cuts.p75 + 1.5 * (cuts.p75 - cuts.p25);
}

// Cut at P25 and P75 of the previous 7 local days, and above the upper Tukey fence
// of the same days. The cut points themselves belong to the lower level. Null cuts
// (fewer than 3 days of history) give no level.
export function levelOf(eurMwh: number, cuts: LevelCuts | null): Level | null {
  if (cuts === null) return null;
  if (eurMwh < cuts.p25) return "cheap";
  if (eurMwh <= cuts.p75) return "normal";
  return eurMwh > veryExpensiveCut(cuts) ? "veryExpensive" : "expensive";
}

// From the price itself, whatever the levels say. The word "free" is not used.
export function isZeroOrNegative(eurMwh: number): boolean {
  return eurMwh <= 0;
}

// Null only when the day has no levels and the price is above zero.
export function roleOf(
  level: Level | null,
  zeroOrNegative: boolean,
): PriceRole | null {
  return zeroOrNegative ? "zeroOrNegative" : level;
}
