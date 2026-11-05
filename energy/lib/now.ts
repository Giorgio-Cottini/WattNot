// The current and the next quarter or hour, by instant (D12). Across midnight the
// next one is tomorrow's first, and it is null while tomorrow is unpublished
// (fixes F08).

export interface Span {
  start: number;
  end: number;
}

export interface NowNext<T extends Span> {
  current: T | null;
  next: T | null;
}

// series: today's quarters or hours then tomorrow's, in instant order.
export function nowAndNext<T extends Span>(
  now: number,
  series: readonly T[],
): NowNext<T> {
  const i = series.findIndex((s) => s.start <= now && now < s.end);
  if (i < 0) return { current: null, next: null };
  const current = series[i];
  const after = series[i + 1];
  return { current, next: after && after.start === current.end ? after : null };
}
