// The Prices tab: Yesterday, Today and Tomorrow as three pages under the day bar.
// The pager and the bar share one position: a swipe moves the pill, a tap moves
// the page. A zone without prices shows its link to Nord Pool instead.

import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { DayBar } from "@/components/DayBar";
import { DayPage } from "@/components/DayPage";
import { useReduceMotion } from "@/components/useReduceMotion";
import { dataStore, useData } from "@/data/appData.ts";
import type { DataState, DayOutcome } from "@/data/store.ts";
import { nowAndNext } from "@/lib/now.ts";
import type { DayPayload } from "@/lib/payload.ts";
import { chartScale, type DayKind, type DayStatus } from "@/lib/screen.ts";
import { buildDay, joinDays } from "@/lib/slots.ts";
import { formatTime } from "@/lib/time.ts";
import { ZONES, type CoveredZone, type UncoveredZone } from "@/lib/zones.ts";
import { DISPLAY_SCALE_CAP, color, space, type } from "@/theme";

const LABELS = ["Yesterday", "Today", "Tomorrow"];
const KINDS: DayKind[] = ["yesterday", "today", "tomorrow"];
const TODAY = 1;

export default function PricesTab() {
  const state = useData();
  // The root shows the first run while the zone is null.
  const zone = state.zone === null ? null : ZONES[state.zone];
  if (!zone) return <View style={styles.screen} />;
  return zone.covered ? (
    <Prices state={state} zone={zone} />
  ) : (
    <Uncovered zone={zone} />
  );
}

function statusOf(outcome: DayOutcome | undefined): DayStatus {
  if (!outcome || outcome.status === "ok") return "idle";
  return outcome.status;
}

function payloadOf(outcome: DayOutcome | undefined): DayPayload | null {
  return outcome?.status === "ok" ? outcome.payload : null;
}

function Prices({ state, zone }: { state: DataState; zone: CoveredZone }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const pager = useRef<PagerView>(null);
  // Fractional page of the pager, for the pill of the day bar.
  const [position] = useState(() => new Animated.Value(TODAY));
  const [index, setIndex] = useState(TODAY);
  const [hours, setHours] = useState(2);

  const outcomes = [state.yesterday, state.today, state.tomorrow].map((d) =>
    d ? state.days[d] : undefined,
  );
  // Three small days: built on each render, the compiler memoizes them.
  const days = outcomes.map((o) => {
    const payload = payloadOf(o);
    return payload && buildDay(payload);
  });
  // One scale for the three days, so their heights compare.
  const scale = chartScale(days);
  const series = joinDays(days[1], days[2]);
  // The Now card reads hourly means: this hour and the next, across midnight.
  const nowNext = nowAndNext(state.now, [
    ...(days[1]?.hours ?? []),
    ...(days[2]?.hours ?? []),
  ]);

  const offline = outcomes.some((o) => o?.status === "offline");
  const fetchedAt = outcomes.flatMap((o) =>
    o?.status === "ok" ? [o.fetchedAt] : [],
  );
  const updated =
    offline && fetchedAt.length
      ? formatTime(Math.max(...fetchedAt), zone.tz)
      : null;

  const show = (page: number) => {
    if (reduceMotion) pager.current?.setPageWithoutAnimation(page);
    else pager.current?.setPage(page);
  };
  const refresh = () => void dataStore.refresh();

  const { yesterday, today, tomorrow, tomorrowFrom } = state;
  // Before the first tick of a new zone.
  if (
    yesterday === null ||
    today === null ||
    tomorrow === null ||
    tomorrowFrom === null
  ) {
    return <View style={styles.screen} />;
  }
  const pageDates = [yesterday, today, tomorrow];

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + space.s }]}>
        <DayBar
          labels={LABELS}
          index={index}
          position={position}
          onSelect={show}
        />
      </View>
      <PagerView
        ref={pager}
        style={styles.flex}
        initialPage={TODAY}
        onPageSelected={(e) => setIndex(e.nativeEvent.position)}
        onPageScroll={(e) =>
          position.setValue(e.nativeEvent.position + e.nativeEvent.offset)
        }
      >
        {KINDS.map((kind, i) => (
          <View key={kind} style={styles.flex}>
            <DayPage
              kind={kind}
              date={pageDates[i]}
              day={days[i]}
              status={statusOf(outcomes[i])}
              zone={zone}
              scale={scale}
              now={state.now}
              tomorrowFrom={tomorrowFrom}
              nowNext={kind === "today" ? nowNext : null}
              series={series}
              hours={hours}
              onHours={setHours}
              refreshing={state.refreshing}
              onRefresh={refresh}
              onShowToday={() => show(TODAY)}
              onAbout={() => router.push("/about")}
              updated={updated}
            />
          </View>
        ))}
      </PagerView>
    </View>
  );
}

function Uncovered({ zone }: { zone: UncoveredZone }) {
  const router = useRouter();
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.padded}
    >
      <View>
        <Text style={[type.zone, styles.ink]} accessibilityRole="header">
          {zone.name}
        </Text>
        <Text style={[type.subhead, styles.secondary]}>
          Bidding zone {zone.shownCode}
        </Text>
      </View>
      <Card style={styles.gap}>
        <Text
          style={[type.window, styles.ink]}
          maxFontSizeMultiplier={DISPLAY_SCALE_CAP}
        >
          Not available yet
        </Text>
        <Text style={[type.body, styles.ink]}>
          WattNot has no licensed prices for {zone.name} yet. Nord Pool shows
          them on its public page.
        </Text>
        <Button
          primary
          label="Open Nord Pool prices"
          onPress={() => void Linking.openURL(zone.link)}
          accessibilityHint="Opens Nord Pool's website"
        />
        <Button
          label="Choose another zone"
          onPress={() => router.push("/zone")}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  flex: { flex: 1 },
  bar: { paddingHorizontal: space.gutter, paddingBottom: space.s },
  padded: { padding: space.gutter, paddingTop: space.xl, gap: space.xl },
  gap: { gap: space.l },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
});
