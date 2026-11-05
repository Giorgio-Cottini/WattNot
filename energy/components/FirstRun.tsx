// First run (D20): the zone from the device time zone, confirmed in one tap. SE,
// NO and DK ask which zone. Shown by the root before any navigator mounts.

import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { dataStore } from "@/data/appData.ts";
import type { DataState } from "@/data/store.ts";
import { ZONES, ZONE_LIST, type ZoneCode } from "@/lib/zones.ts";
import { DISPLAY_SCALE_CAP, color, space, type } from "@/theme";

import { Button } from "./Button";
import { Card } from "./Card";
import { ZoneList } from "./ZoneList";

export function FirstRun({ state }: { state: DataState }) {
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState(false);
  const guess = state.guess;
  const choose = (code: ZoneCode) => void dataStore.setZone(code);
  const single =
    guess && guess.options.length === 1 ? ZONES[guess.preselected] : null;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.xxl,
        },
      ]}
    >
      <View style={styles.intro}>
        <Text style={[type.zone, styles.ink]} accessibilityRole="header">
          WattNot
        </Text>
        <Text style={[type.body, styles.secondary]}>
          Day-ahead electricity prices for your zone: yesterday, today and
          tomorrow.
        </Text>
      </View>
      {single && !all ? (
        <Card style={styles.card}>
          <View>
            <Text
              style={[type.window, styles.ink]}
              maxFontSizeMultiplier={DISPLAY_SCALE_CAP}
              accessibilityRole="header"
            >
              {single.name}
            </Text>
            <Text style={[type.subhead, styles.secondary]}>
              Bidding zone {single.shownCode}, from the time zone of this
              iPhone.
            </Text>
          </View>
          <Button
            primary
            label="Use this zone"
            onPress={() => choose(single.code)}
          />
          <Button label="Choose another zone" onPress={() => setAll(true)} />
        </Card>
      ) : (
        <View style={styles.pick}>
          <Text
            style={[type.headline, styles.ink, styles.question]}
            accessibilityRole="header"
          >
            {guess && !all ? "Which zone are you in?" : "Choose your zone"}
          </Text>
          <Card style={styles.list}>
            <ZoneList
              codes={
                guess && !all ? guess.options : ZONE_LIST.map((z) => z.code)
              }
              selected={null}
              onSelect={choose}
            />
          </Card>
          {guess && !all && (
            <Button label="Show all zones" onPress={() => setAll(true)} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space.gutter, gap: space.xl },
  intro: { gap: space.s },
  card: { gap: space.l },
  pick: { gap: space.l },
  question: { paddingHorizontal: space.xs },
  list: { padding: 0, paddingBottom: space.s, overflow: "hidden" },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
});
