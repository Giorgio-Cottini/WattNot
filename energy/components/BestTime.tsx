// The Best time card (PLAN.md section 4): the duration, then the cheapest
// contiguous window. On today it runs from the current quarter to the end of the
// published prices and compares with a start now. On another day it is the
// cheapest window of that day.

import SegmentedControl, {
  type SegmentedControlProps,
} from "@react-native-segmented-control/segmented-control";
import type { ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { BestWindow } from "@/lib/best.ts";
import { priceParts, spokenPrice, windowLabel } from "@/lib/screen.ts";
import type { Zone } from "@/lib/zones.ts";
import { DISPLAY_SCALE_CAP, color, segmented, space, type } from "@/theme";

import { Card } from "./Card";

const DURATIONS = ["1 h", "2 h", "3 h", "4 h"];

// The package declares its class over the React Native 0.8x native methods, which
// the 0.88 types no longer accept as a JSX element. The props are unchanged.
const Segmented =
  SegmentedControl as unknown as ComponentType<SegmentedControlProps>;

interface Props {
  zone: Zone;
  // The page's date: a window inside it shows as a plain range.
  date: string;
  hours: number;
  onHours(hours: number): void;
  best: BestWindow | null;
  // Today: the window starts at the current quarter or later.
  fromNow: boolean;
}

export function BestTime({ zone, date, hours, onHours, best, fromNow }: Props) {
  return (
    <Card>
      <View style={styles.head}>
        <Text style={[type.headline, styles.ink]} accessibilityRole="header">
          Best time
        </Text>
        <Segmented
          values={DURATIONS}
          selectedIndex={hours - 1}
          onChange={(e) => onHours(e.nativeEvent.selectedSegmentIndex + 1)}
          style={styles.durations}
          accessibilityLabel="Duration"
          {...segmented}
        />
      </View>
      <Text style={[type.footnote, styles.secondary]}>
        {fromNow
          ? "The cheapest hours in a row, from now to the end of the published prices."
          : "The cheapest hours in a row of the day."}
      </Text>
      {best ? (
        <Result zone={zone} date={date} best={best} fromNow={fromNow} />
      ) : (
        <Text style={[type.body, styles.secondary, styles.result]}>
          Not enough published prices for {hours} h.
        </Text>
      )}
    </Card>
  );
}

function Result({
  zone,
  date,
  best,
  fromNow,
}: {
  zone: Zone;
  date: string;
  best: BestWindow;
  fromNow: boolean;
}) {
  const average = priceParts(best.price, zone);
  return (
    <View style={styles.result}>
      <Text
        style={[type.window, styles.ink]}
        maxFontSizeMultiplier={DISPLAY_SCALE_CAP}
      >
        {fromNow && best.startsNow
          ? "Now is the cheapest time"
          : windowLabel(best, date, zone.tz)}
      </Text>
      <View style={styles.rows}>
        <View
          style={styles.row}
          accessible
          accessibilityLabel={`Average, ${spokenPrice(best.price, zone)}`}
        >
          <Text style={[type.body, styles.ink]}>Average</Text>
          <Text style={[type.body, styles.ink, styles.value]}>
            {average.amount} {average.unit}
          </Text>
        </View>
        {fromNow && !best.startsNow && (
          <View
            style={styles.row}
            accessible
            accessibilityLabel={`Spot price difference against starting now, ${spokenPrice(-best.difference, zone)} less`}
          >
            <View style={styles.label}>
              <Text style={[type.body, styles.ink]}>Spot price difference</Text>
              <Text style={[type.footnote, styles.secondary]}>
                against starting now
              </Text>
            </View>
            <Text style={[type.body, styles.ink, styles.value]}>
              {priceParts(best.difference, zone).amount} {average.unit}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    rowGap: space.s,
    marginBottom: space.xs,
  },
  durations: { width: 200, height: 36 },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
  result: { marginTop: space.m },
  rows: { marginTop: space.s },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.l,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  label: { flexShrink: 1 },
  value: { fontWeight: "600", textAlign: "right", flexShrink: 0 },
});
