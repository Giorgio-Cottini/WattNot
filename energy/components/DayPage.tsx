// One day of the pager: the date and the zone, today's current price card, the
// chart card with the extremes of the day, the Best time card and the footer. A
// day without prices shows its one line and one action in the chart card.

import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { bestWindow } from "@/lib/best.ts";
import { sourceNotes } from "@/lib/format.ts";
import { ROLE_WORD, roleOf, type PriceRole } from "@/lib/levels.ts";
import {
  dayExtremes,
  dayLabel,
  emptyState,
  priceParts,
  rangeLabel,
  spokenPrice,
  type ChartScale,
  type DayKind,
  type DayStatus,
} from "@/lib/screen.ts";
import type { Day, HourStep, Slot } from "@/lib/slots.ts";
import type { CoveredZone } from "@/lib/zones.ts";
import {
  DISPLAY_SCALE_CAP,
  PRESSED,
  TARGET,
  color,
  roleText,
  space,
  type,
} from "@/theme";

import { BestTime } from "./BestTime";
import { Button } from "./Button";
import { Card } from "./Card";
import { CurrentPrice } from "./CurrentPrice";
import { Footer } from "./Footer";
import { Icon } from "./Icon";
import { ChartSkeleton, StepChart, chartHeight } from "./StepChart";
import { Tag } from "./Tag";

export interface DayPageProps {
  kind: DayKind;
  date: string;
  day: Day | null;
  // Status when day is null.
  status: DayStatus;
  zone: CoveredZone;
  scale: ChartScale | null;
  now: number;
  tomorrowFrom: number;
  // Today's current and next hour. Null on the other days.
  nowNext: { current: HourStep | null; next: HourStep | null } | null;
  // Today's slots then tomorrow's, for the best window from now.
  series: readonly Slot[];
  hours: number;
  onHours(hours: number): void;
  refreshing: boolean;
  onRefresh(): void;
  onShowToday(): void;
  onAbout(): void;
  updated: string | null;
}

export function DayPage(props: DayPageProps) {
  const { kind, date, day, zone, scale, now, hours, series } = props;
  const { width, fontScale } = useWindowDimensions();
  // The chart fills the card: the gutter and the card padding on both sides.
  const chartWidth = Math.floor(width - 2 * space.gutter - 2 * space.l - 1);
  // SVG text does not follow Dynamic Type: the chart scales it, capped so the
  // hour labels keep their spacing.
  const textScale = Math.min(Math.max(fontScale, 1), 1.5);

  const best = useMemo(() => {
    if (!day) return null;
    if (kind === "today") return bestWindow(now, series, hours);
    return bestWindow(day.slots[0].start, day.slots, hours);
  }, [day, kind, now, series, hours]);

  const roles = useMemo(() => {
    const set = new Set<PriceRole>();
    for (const h of day?.hours ?? []) {
      const role = roleOf(h.level, h.zeroOrNegative);
      if (role) set.add(role);
    }
    return set;
  }, [day]);
  const notes = useMemo(
    () => (day ? sourceNotes([{ payload: day.payload, label: kind }]) : []),
    [day, kind],
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
          tintColor={color.accent}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text
            style={[type.title, styles.ink]}
            accessibilityRole="header"
            maxFontSizeMultiplier={DISPLAY_SCALE_CAP}
          >
            {dayLabel(date)}
          </Text>
          <Text style={[type.subhead, styles.secondary]}>
            {zone.name} · {zone.shownCode}
          </Text>
        </View>
        <Pressable
          onPress={props.onAbout}
          style={({ pressed }) => [styles.info, pressed && PRESSED]}
          accessibilityRole="button"
          accessibilityLabel="About WattNot"
        >
          <Icon name="info.circle" size={24} color={color.accent} />
        </Pressable>
      </View>
      {kind === "today" && props.nowNext?.current && (
        <CurrentPrice
          zone={zone}
          current={props.nowNext.current}
          next={props.nowNext.next}
        />
      )}
      {day && scale ? (
        <ChartCard
          day={day}
          zone={zone}
          scale={scale}
          width={chartWidth}
          textScale={textScale}
          now={now}
          best={best && { start: best.start, end: best.end, hours }}
        />
      ) : (
        <EmptyCard
          kind={kind}
          status={props.status}
          now={now}
          tomorrowFrom={props.tomorrowFrom}
          tz={zone.tz}
          width={chartWidth}
          textScale={textScale}
          onRetry={props.onRefresh}
          onShowToday={props.onShowToday}
        />
      )}
      {day && (
        <BestTime
          zone={zone}
          date={date}
          hours={hours}
          onHours={props.onHours}
          best={best}
          fromNow={kind === "today"}
        />
      )}
      <Footer roles={roles} notes={notes} updated={props.updated} />
    </ScrollView>
  );
}

function ChartCard({
  day,
  zone,
  scale,
  width,
  textScale,
  now,
  best,
}: {
  day: Day;
  zone: CoveredZone;
  scale: ChartScale;
  width: number;
  textScale: number;
  now: number;
  best: { start: number; end: number; hours: number } | null;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  const extremes = useMemo(() => dayExtremes(day), [day]);
  const onDay =
    now >= day.hours[0].start && now < day.hours[day.hours.length - 1].end;
  return (
    <Card style={styles.chartCard}>
      {/* Two lines reserved, so the chart does not move while a finger scrubs. */}
      <View style={styles.chartHead}>
        {slot ? (
          <QuarterLine slot={slot} zone={zone} />
        ) : (
          <Text style={[type.headline, styles.ink]} accessibilityRole="header">
            Hourly prices
          </Text>
        )}
      </View>
      <View style={styles.chartBody}>
        <StepChart
          day={day}
          zone={zone}
          scale={scale}
          width={width}
          textScale={textScale}
          now={onDay ? now : null}
          best={best}
          onScrub={setSlot}
        />
        <View style={styles.extremes}>
          <Extreme label="Min price" slot={extremes.low} zone={zone} />
          <View style={styles.divider} />
          <Extreme label="Max price" slot={extremes.high} zone={zone} />
        </View>
      </View>
    </Card>
  );
}

function EmptyCard({
  kind,
  status,
  now,
  tomorrowFrom,
  tz,
  width,
  textScale,
  onRetry,
  onShowToday,
}: {
  kind: DayKind;
  status: DayStatus;
  now: number;
  tomorrowFrom: number;
  tz: string;
  width: number;
  textScale: number;
  onRetry(): void;
  onShowToday(): void;
}) {
  const empty = emptyState(kind, status, now, tomorrowFrom, tz);
  return (
    <Card>
      {empty.kind === "loading" ? (
        <ChartSkeleton width={width} height={chartHeight(textScale)} />
      ) : (
        <View style={[styles.empty, { minHeight: chartHeight(textScale) }]}>
          <Text style={[type.body, styles.ink]}>{empty.message}</Text>
          <Button
            label={empty.label}
            onPress={empty.action === "retry" ? onRetry : onShowToday}
          />
        </View>
      )}
    </Card>
  );
}

// While a finger is down: the quarter's range and tag, then its price.
function QuarterLine({ slot, zone }: { slot: Slot; zone: CoveredZone }) {
  const role = roleOf(slot.level, slot.zeroOrNegative);
  const parts = priceParts(slot.price, zone);
  return (
    <>
      <View style={styles.line}>
        <Text style={[type.headline, styles.ink]}>
          {rangeLabel(slot.start, slot.end, zone.tz)}
        </Text>
        {role && <Tag role={role} small />}
      </View>
      <Text style={[type.subhead, styles.ink]}>
        {parts.amount} {parts.unit}
      </Text>
    </>
  );
}

// The lowest or highest quarter of the day (D12): the label, the quarter's range
// and its price in the hue of its level. VoiceOver also reads the level word.
function Extreme({
  label,
  slot,
  zone,
}: {
  label: string;
  slot: Slot;
  zone: CoveredZone;
}) {
  const parts = priceParts(slot.price, zone);
  const role = roleOf(slot.level, slot.zeroOrNegative);
  const range = rangeLabel(slot.start, slot.end, zone.tz);
  return (
    <View
      style={styles.extreme}
      accessible
      accessibilityLabel={`${label}, ${range}, ${spokenPrice(slot.price, zone)}${role ? `, ${ROLE_WORD[role]}` : ""}`}
    >
      <Text style={[type.subhead, styles.secondary]}>{label}</Text>
      <Text style={[type.body, styles.ink]}>{range}</Text>
      <Text style={[type.title, { color: roleText(role) }]}>
        {parts.amount} <Text style={type.subhead}>{parts.unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.gutter, gap: space.l },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.s,
    paddingHorizontal: space.xs,
  },
  info: {
    width: TARGET,
    height: TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -10,
    marginRight: -12,
  },
  chartCard: { padding: 0 },
  chartHead: {
    minHeight: 56,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  chartBody: { padding: space.l, paddingTop: space.l },
  line: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.m,
    rowGap: 2,
  },
  extremes: {
    flexDirection: "row",
    gap: space.l,
    paddingTop: space.m,
    marginTop: space.s,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  extreme: { flex: 1, gap: 2 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  empty: {
    justifyContent: "center",
    alignItems: "flex-start",
    gap: space.l,
  },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
});
