// The Best time card: the cheapest contiguous window of a given duration, from the
// current quarter to the end of published data.

import { SLOT_MS, type Slot } from "./slots.ts";
import { HOUR_MS } from "./time.ts";

export interface BestWindow {
  // UTC epoch ms.
  start: number;
  end: number;
  // Average over the window, local subunit per kWh, each quarter at its day's rate.
  price: number;
  // Average of the window of the same length that starts at the current quarter.
  nowPrice: number;
  // price - nowPrice, never positive: the "spot price difference" against starting now.
  difference: number;
  // The window starts at the current quarter: "Now is the cheapest time".
  startsNow: boolean;
}

// Sums closer than this count as equal, and the earlier window wins.
const TIE = 1e-9;

// series: today's slots then tomorrow's, in instant order (joinDays). Null when
// now is outside the series or fewer than `hours` of published data remain.
export function bestWindow(
  now: number,
  series: readonly Slot[],
  hours: number,
): BestWindow | null {
  const length = (hours * HOUR_MS) / SLOT_MS;
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError(
      `bestWindow: ${hours} h is not a whole number of quarters`,
    );
  }
  const first = series.findIndex((s) => s.start <= now && now < s.end);
  if (first < 0) return null;

  let best = -1;
  let bestSum = Infinity;
  let nowSum = NaN;
  for (let i = first; i + length <= series.length; i++) {
    // A window that spans a gap in the series is not contiguous.
    if (series[i + length - 1].end - series[i].start !== length * SLOT_MS)
      continue;
    let sum = 0;
    for (let j = i; j < i + length; j++) sum += series[j].price;
    if (i === first) nowSum = sum;
    if (sum < bestSum - TIE) {
      best = i;
      bestSum = sum;
    }
  }
  if (best < 0 || Number.isNaN(nowSum)) return null;
  const price = bestSum / length;
  const nowPrice = nowSum / length;
  return {
    start: series[best].start,
    end: series[best + length - 1].end,
    price,
    nowPrice,
    difference: price - nowPrice,
    startsNow: best === first,
  };
}
