// The current price card of today: the level now, the mean of the current hour
// on a block in its colour, and the next hour against it (D19).

import { StyleSheet, Text, View } from "react-native";

import { ROLE_WORD, roleOf } from "@/lib/levels.ts";
import { priceParts, rangeLabel, spokenPrice } from "@/lib/screen.ts";
import type { HourStep } from "@/lib/slots.ts";
import type { Zone } from "@/lib/zones.ts";
import { color, radius, roleColor, roleText, space, type } from "@/theme";

import { Card } from "./Card";
import { Tag } from "./Tag";

interface Props {
  zone: Zone;
  current: HourStep;
  next: HourStep | null;
}

export function CurrentPrice({ zone, current, next }: Props) {
  const role = roleOf(current.level, current.zeroOrNegative);
  const fill = role ? roleColor[role].fill : color.unleveled;
  const ink = role ? roleColor[role].ink : color.ink;
  const parts = priceParts(current.price, zone);
  const range = rangeLabel(current.start, current.end, zone.tz);
  return (
    <Card>
      <View style={styles.head}>
        <Text style={[type.body, styles.ink]}>Price now</Text>
        {role && <Tag role={role} />}
      </View>
      <View
        accessible
        accessibilityLabel={`This hour, ${range}, average ${spokenPrice(current.price, zone)}${role ? `, ${ROLE_WORD[role]}` : ""}`}
        style={[styles.block, { backgroundColor: fill, shadowColor: fill }]}
      >
        <View style={styles.priceRow}>
          <Text
            style={[type.bigPrice, { color: ink }]}
            maxFontSizeMultiplier={1.4}
          >
            {parts.amount}
          </Text>
          <Text style={[type.body, { color: ink }]}>{parts.unit}</Text>
        </View>
        <Text style={[type.subhead, { color: ink }]}>Average {range}</Text>
      </View>
      {next && <NextLine zone={zone} current={current} next={next} />}
    </Card>
  );
}

// "▲ 3%" of the next hour against the current one. Null at a zero current
// price, where a ratio has no meaning, and when the rounded change is zero.
function percentChange(from: number, to: number) {
  if (Math.abs(from) < 1e-9) return null;
  const pct = Math.round(((to - from) / Math.abs(from)) * 100);
  if (pct === 0) return null;
  const up = pct > 0;
  return {
    text: `${up ? "▲" : "▼"} ${Math.abs(pct)}%`,
    spoken: `${Math.abs(pct)} percent ${up ? "more" : "less"}`,
  };
}

function NextLine({
  zone,
  current,
  next,
}: {
  zone: Zone;
  current: HourStep;
  next: HourStep;
}) {
  const parts = priceParts(next.price, zone);
  const role = roleOf(next.level, next.zeroOrNegative);
  const change = percentChange(current.price, next.price);
  const range = rangeLabel(next.start, next.end, zone.tz);
  // The level shows as the hue of the price; VoiceOver still reads its word.
  return (
    <View
      style={styles.next}
      accessible
      accessibilityLabel={`Next hour, ${range}, average ${spokenPrice(next.price, zone)}${role ? `, ${ROLE_WORD[role]}` : ""}${change ? `, ${change.spoken}` : ""}`}
    >
      <Text style={[type.body, styles.ink, styles.nextLabel]}>{range}</Text>
      <Text style={[type.body, styles.value, { color: roleText(role) }]}>
        {parts.amount} {parts.unit}
      </Text>
      {change && (
        <Text style={[type.subhead, styles.secondary]}>{change.text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s,
    marginBottom: space.m,
  },
  // [iOS-only] shadow*: a soft glow in the block's own colour. Android
  // equivalent: elevation 6.
  block: {
    borderRadius: radius.block,
    paddingVertical: space.xl,
    paddingHorizontal: space.l,
    alignItems: "center",
    gap: space.xs,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: space.s,
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: space.s,
    rowGap: space.xs,
    marginTop: space.l,
  },
  nextLabel: { marginRight: "auto" },
  value: { fontWeight: "600" },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
});
