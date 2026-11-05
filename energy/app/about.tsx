// About (D18): what the prices are, what the levels mean, the sources and their
// licence, privacy and contact.

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetHeader } from "@/components/SheetHeader";
import { Tag } from "@/components/Tag";
import { DEFAULT_BASE_URL } from "@/data/api.ts";
import { CAPTION, LICENCE_URL } from "@/lib/format.ts";
import type { PriceRole } from "@/lib/levels.ts";
import { PRESSED, TARGET, color, space, type } from "@/theme";

const LEVELS: [PriceRole, string][] = [
  ["zeroOrNegative", "The price is zero or below zero."],
  [
    "cheap",
    "Below P25 of the previous 7 days: cheaper than three quarters of them.",
  ],
  ["normal", "From P25 to P75 of the previous 7 days."],
  ["expensive", "Above P75 of the previous 7 days."],
  [
    "veryExpensive",
    "Far above the previous 7 days: above P75 + 1.5 × (P75 − P25).",
  ],
];

const CONTACT = "cottinigiorgio@gmail.com";

export default function About() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.sheet}>
      <SheetHeader title="About WattNot" onDone={() => router.back()} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <Section title="The prices">
          <Body>
            WattNot shows the day-ahead spot price of electricity in your
            bidding zone, for today and tomorrow, for every quarter hour.
          </Body>
          <Body>
            {
              "Tomorrow's prices usually arrive after 13:00 Central European Time."
            }
          </Body>
          <Body>{CAPTION}</Body>
        </Section>
        <Section title="Levels">
          <Body>
            Each price has a level against the previous 7 days of its zone.
          </Body>
          {LEVELS.map(([role, text]) => (
            <View key={role} style={styles.level}>
              <View style={styles.tagCell}>
                <Tag role={role} small />
              </View>
              <Text style={[type.subhead, styles.ink, styles.flex]}>
                {text}
              </Text>
            </View>
          ))}
        </Section>
        <Section title="Best time">
          <Body>
            The cheapest 1, 2, 3 or 4 hours in a row, from the current quarter
            to the end of the published prices. The spot price difference
            compares its average with a start now.
          </Body>
        </Section>
        <Section title="Sources">
          <Body>Source: Energinet (www.energidataservice.dk), CC BY 4.0.</Body>
          <Body>Source: Bundesnetzagentur | SMARD.de, CC BY 4.0.</Body>
          <Body>Exchange rate: European Central Bank reference rate.</Body>
          <Body>
            WattNot converts the prices from EUR/MWh to the subunit of the local
            currency per kWh.
          </Body>
          <Link label="Licence: CC BY 4.0" url={LICENCE_URL} />
        </Section>
        <Section title="Privacy">
          <Body>
            WattNot collects no data. It stores your zone on this iPhone.
          </Body>
          <Link
            label="Privacy policy"
            url={`${DEFAULT_BASE_URL}/site/privacy.html`}
          />
        </Section>
        <Section title="Contact">
          <Link label="Support" url={`${DEFAULT_BASE_URL}/site/support.html`} />
          <Link label={CONTACT} url={`mailto:${CONTACT}`} />
        </Section>
        <Text style={[type.footnote, styles.secondary]}>
          Version {Constants.expoConfig?.version ?? "unknown"}
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[type.headline, styles.ink]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <Text style={[type.body, styles.ink]}>{children}</Text>;
}

function Link({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.link, pressed && PRESSED]}
    >
      <Text style={[type.body, styles.linkText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.ground },
  content: {
    paddingHorizontal: space.gutter,
    gap: space.xl,
    paddingTop: space.s,
  },
  section: { gap: space.s },
  // The tag column wraps under the tag when large text needs the width.
  level: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    columnGap: space.m,
    rowGap: space.xs,
  },
  tagCell: { minWidth: 124, alignItems: "flex-start" },
  flex: { flex: 1, minWidth: 180 },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
  link: {
    minHeight: TARGET,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  linkText: { color: color.accent, textDecorationLine: "underline" },
});
