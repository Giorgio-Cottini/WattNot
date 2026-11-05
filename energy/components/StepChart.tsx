// The Step chart of one day (D10, D11, D12): hourly steps as flat fields in the
// colour of their role, joined edge to edge. An ink rule marks now, an ink
// bracket under the hours marks the best window. A finger down reads the quarter
// under it; VoiceOver adjusts through the hours.

import { useMemo, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";

import { ROLE_WORD, roleOf } from "@/lib/levels.ts";
import {
  hourTicks,
  rangeLabel,
  spokenPrice,
  type ChartScale,
} from "@/lib/screen.ts";
import type { Day, HourStep, Slot } from "@/lib/slots.ts";
import type { Zone } from "@/lib/zones.ts";
import { color, roleColor } from "@/theme";

const PLOT_HEIGHT = 156;
const TOP = 12;
const MIN_NEGATIVE = 3;
// Hour labels, then the bracket and its label, both grown with the text.
const axisHeight = (s: number) => Math.ceil(20 * s);
const bracketHeight = (s: number) => Math.ceil(28 * s);

export function chartHeight(textScale: number): number {
  return PLOT_HEIGHT + axisHeight(textScale) + bracketHeight(textScale);
}

interface Props {
  day: Day;
  zone: Zone;
  scale: ChartScale;
  width: number;
  // Factor for the SVG text, from the Dynamic Type size.
  textScale: number;
  // Instant of now when it falls on this day.
  now: number | null;
  // The best window, clipped to this day by the chart.
  best: { start: number; end: number; hours: number } | null;
  // The quarter under the finger, or null when it lifts.
  onScrub(slot: Slot | null): void;
}

function fillOf(step: HourStep | Slot): string {
  const role = roleOf(step.level, step.zeroOrNegative);
  return role ? roleColor[role].fill : color.unleveled;
}

export function StepChart({
  day,
  zone,
  scale,
  width,
  textScale,
  now,
  best,
  onScrub,
}: Props) {
  const n = day.hours.length;
  const stepWidth = width / n;
  const y = (v: number) =>
    TOP + ((scale.max - v) / (scale.max - scale.min)) * (PLOT_HEIGHT - TOP);
  const zeroY = y(0);
  const dayStart = day.hours[0].start;
  const dayEnd = day.hours[n - 1].end;
  // Instant to x, through the hour that holds it: DST days have 23 or 25 steps.
  const xOf = (instant: number) => {
    const t = Math.min(Math.max(instant, dayStart), dayEnd);
    const i = day.hours.findIndex((h) => t < h.end);
    if (i < 0) return width;
    const h = day.hours[i];
    return (i + (t - h.start) / (h.end - h.start)) * stepWidth;
  };

  const [scrubbed, setScrubbed] = useState<Slot | null>(null);
  // The readout shows at touch down (onBegin). A horizontal move of 6 pt takes the
  // scrub ahead of the pager, a vertical move of 8 pt fails it and scrolls the page
  // (D11, revised with the owner).
  const pan = useMemo(() => {
    const slotAt = (x: number): Slot => {
      const i = Math.min(n - 1, Math.max(0, Math.floor(x / stepWidth)));
      const quarters = day.hours[i].slots;
      const q = Math.floor(((x - i * stepWidth) / stepWidth) * quarters.length);
      return quarters[Math.min(quarters.length - 1, Math.max(0, q))];
    };
    const scrub = (slot: Slot | null) => {
      setScrubbed(slot);
      onScrub(slot);
    };
    return Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-8, 8])
      .shouldCancelWhenOutside(false)
      .runOnJS(true)
      .onBegin((e) => scrub(slotAt(e.x)))
      .onUpdate((e) => scrub(slotAt(e.x)))
      .onFinalize(() => scrub(null));
  }, [day, n, stepWidth, onScrub]);

  // VoiceOver: adjustable through the hours, from the hour of now on today. A new
  // hour of now moves the focus back to it.
  const nowIndex =
    now === null
      ? 0
      : Math.max(
          0,
          day.hours.findIndex((h) => now < h.end),
        );
  const [focus, setFocus] = useState(nowIndex);
  const [focusBase, setFocusBase] = useState(nowIndex);
  if (focusBase !== nowIndex) {
    setFocusBase(nowIndex);
    setFocus(nowIndex);
  }
  const focused = day.hours[Math.min(focus, n - 1)];
  const focusedRole = roleOf(focused.level, focused.zeroOrNegative);
  const summary = useMemo(() => {
    const low = day.hours.reduce((a, b) => (b.price < a.price ? b : a));
    const high = day.hours.reduce((a, b) => (b.price > a.price ? b : a));
    return `Hourly prices. Lowest at ${low.label}, ${spokenPrice(low.price, zone)}. Highest at ${high.label}, ${spokenPrice(high.price, zone)}.`;
  }, [day, zone]);

  // The fields, the grid and the extreme words do not change while a finger
  // scrubs: one layer, drawn again only for a new day, scale, width or text size.
  const fields = useMemo(() => {
    const yOf = (v: number) =>
      TOP + ((scale.max - v) / (scale.max - scale.min)) * (PLOT_HEIGHT - TOP);
    const base = yOf(0);
    const label = 11 * textScale;
    return (
      <G>
        {day.hours.map((h, i) => {
          // A zero or negative hour shows at least a sliver below the line.
          const depth = h.zeroOrNegative
            ? Math.max(yOf(h.price) - base, MIN_NEGATIVE)
            : yOf(h.price) - base;
          return (
            <Rect
              key={h.start}
              x={i * stepWidth}
              y={Math.min(base + depth, base)}
              // Overlap by half a point: no seam between fields.
              width={stepWidth + 0.5}
              height={Math.abs(depth)}
              fill={fillOf(h)}
            />
          );
        })}
        {scale.ticks.map((t) => (
          <G key={t}>
            <Line
              x1={0}
              x2={width}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke={color.ink}
              strokeOpacity={0.14}
            />
            {/* A white halo under the value keeps it legible on any field. */}
            <SvgText
              x={width - 2}
              y={yOf(t) - 4}
              textAnchor="end"
              fontSize={label}
              fill={color.ground}
              stroke={color.ground}
              strokeWidth={3}
              strokeLinejoin="round"
            >
              {t}
            </SvgText>
            <SvgText
              x={width - 2}
              y={yOf(t) - 4}
              textAnchor="end"
              fontSize={label}
              fill={color.inkSecondary}
            >
              {t}
            </SvgText>
          </G>
        ))}
        <Line
          x1={0}
          x2={width}
          y1={base}
          y2={base}
          stroke={color.ink}
          strokeWidth={1.5}
        />
        {extremeRuns(day.hours).map((run) => {
          // The word sits in clear space: above every field its width spans.
          const text = ROLE_WORD[run.role];
          const w = text.length * 6.4 * textScale;
          const cx = Math.min(
            width - w / 2,
            Math.max(w / 2, ((run.from + run.to) / 2) * stepWidth),
          );
          const spanned = day.hours.slice(
            Math.max(0, Math.floor((cx - w / 2) / stepWidth)),
            Math.ceil((cx + w / 2) / stepWidth),
          );
          const top = Math.max(0, ...spanned.map((h) => h.price));
          return (
            <SvgText
              key={`${run.role}${run.from}`}
              x={cx}
              y={yOf(top) - 6}
              textAnchor="middle"
              fontSize={label}
              fontWeight="600"
              fill={color.ink}
            >
              {text}
            </SvgText>
          );
        })}
      </G>
    );
  }, [day, scale, width, stepWidth, textScale]);

  const ticks = useMemo(() => hourTicks(day, 6), [day]);
  const nowX = now === null ? null : xOf(now);
  const bestX =
    best && best.end > dayStart && best.start < dayEnd
      ? [xOf(best.start), xOf(best.end)]
      : null;
  const axis = axisHeight(textScale);
  // Bracket under the hour labels, in the axis drawing.
  const bracketY = axis + 6;
  const scrubX = scrubbed ? xOf(scrubbed.start) : null;
  const small = 11 * textScale;
  const mark = 12 * textScale;

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={summary}
          accessibilityValue={{
            text: `${rangeLabel(focused.start, focused.end, zone.tz)}, ${spokenPrice(focused.price, zone)}${focusedRole ? `, ${ROLE_WORD[focusedRole]}` : ""}`,
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => {
            const step = e.nativeEvent.actionName === "increment" ? 1 : -1;
            setFocus((f) => Math.min(n - 1, Math.max(0, f + step)));
          }}
        >
          <Svg width={width} height={PLOT_HEIGHT}>
            {bestX && (
              <Rect
                x={bestX[0]}
                y={0}
                width={bestX[1] - bestX[0]}
                height={PLOT_HEIGHT}
                fill={color.shade}
              />
            )}
            {fields}
            {nowX !== null && scrubX === null && (
              <G>
                <Line
                  x1={nowX}
                  x2={nowX}
                  y1={4}
                  y2={PLOT_HEIGHT}
                  stroke={color.ink}
                  strokeWidth={2}
                />
                <Rect
                  x={nowX - 4}
                  y={0}
                  width={8}
                  height={8}
                  fill={color.ink}
                />
                <SvgText
                  x={nowX > width - 40 ? nowX - 8 : nowX + 8}
                  y={9}
                  textAnchor={nowX > width - 40 ? "end" : "start"}
                  fontSize={mark}
                  fontWeight="600"
                  fill={color.ink}
                >
                  now
                </SvgText>
              </G>
            )}
            {scrubX !== null && scrubbed && (
              <G>
                <Rect
                  x={scrubX}
                  y={Math.min(y(scrubbed.price), zeroY)}
                  width={stepWidth / 4}
                  height={Math.abs(y(scrubbed.price) - zeroY)}
                  fill={color.ink}
                />
                <Line
                  x1={scrubX + stepWidth / 8}
                  x2={scrubX + stepWidth / 8}
                  y1={0}
                  y2={PLOT_HEIGHT}
                  stroke={color.ink}
                  strokeWidth={1}
                />
              </G>
            )}
          </Svg>
        </View>
      </GestureDetector>
      <Svg
        width={width}
        height={axis + bracketHeight(textScale)}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {ticks.map((i) => (
          <SvgText
            key={i}
            x={i * stepWidth}
            y={14 * textScale}
            fontSize={small}
            fill={color.inkSecondary}
          >
            {day.hours[i].label}
          </SvgText>
        ))}
        {bestX && best && (
          <G>
            <Path
              d={`M${bestX[0] + 1} ${bracketY - 7}V${bracketY}H${bestX[1] - 1}V${bracketY - 7}`}
              fill="none"
              stroke={color.ink}
              strokeWidth={2}
            />
            <SvgText
              x={Math.min(
                width - 34 * textScale,
                Math.max(34 * textScale, (bestX[0] + bestX[1]) / 2),
              )}
              y={bracketY + 14 * textScale}
              textAnchor="middle"
              fontSize={mark}
              fontWeight="600"
              fill={color.ink}
            >
              {`best ${best.hours} h`}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

interface Run {
  role: "veryExpensive" | "zeroOrNegative";
  // Step indices, to exclusive.
  from: number;
  to: number;
}

// Runs of hours at the two extremes: the chart writes their word on them (form as
// well as hue).
function extremeRuns(hours: readonly HourStep[]): Run[] {
  const runs: Run[] = [];
  hours.forEach((h, i) => {
    const role = roleOf(h.level, h.zeroOrNegative);
    if (role !== "veryExpensive" && role !== "zeroOrNegative") return;
    const last = runs[runs.length - 1];
    if (last && last.role === role && last.to === i) last.to = i + 1;
    else runs.push({ role, from: i, to: i + 1 });
  });
  return runs;
}

// Placeholder while a day loads: flat fields at one height, no values.
export function ChartSkeleton({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const n = 24;
  return (
    <View style={{ height }} accessible accessibilityLabel="Prices are loading">
      <Svg width={width} height={PLOT_HEIGHT}>
        {Array.from({ length: n }, (_, i) => (
          <Rect
            key={i}
            x={(i * width) / n}
            y={PLOT_HEIGHT * 0.45}
            width={width / n + 0.5}
            height={PLOT_HEIGHT * 0.55}
            fill={color.control}
          />
        ))}
      </Svg>
    </View>
  );
}
