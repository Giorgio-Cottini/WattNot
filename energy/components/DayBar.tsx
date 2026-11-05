// The day bar over the pager: Yesterday, Today and Tomorrow in one track, with a
// pill that slides with the swipe. `position` is the pager's fractional page, so
// the pill tracks a finger mid-gesture instead of jumping when the page settles.

import { useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { color, radius, type } from "@/theme";

interface Props {
  labels: readonly string[];
  index: number;
  position: Animated.Value;
  onSelect(index: number): void;
}

const HEIGHT = 36;
const INSET = 2;

export function DayBar({ labels, index, position, onSelect }: Props) {
  const [width, setWidth] = useState(0);
  const segment = (width - 2 * INSET) / labels.length;
  const translateX = position.interpolate({
    inputRange: labels.map((_, i) => i),
    outputRange: labels.map((_, i) => i * segment),
    extrapolate: "clamp",
  });
  return (
    <View
      style={styles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { width: segment, transform: [{ translateX }] }]}
        />
      )}
      {labels.map((label, i) => (
        <Pressable
          key={label}
          style={styles.segment}
          onPress={() => onSelect(i)}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === index }}
        >
          <Text
            style={[type.subhead, styles.label, i === index && styles.selected]}
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    height: HEIGHT,
    padding: INSET,
    borderRadius: radius.chip + INSET,
    backgroundColor: color.control,
  },
  // [iOS-only] shadow*. Android equivalent: elevation 2.
  pill: {
    position: "absolute",
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: radius.chip,
    backgroundColor: color.card,
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  segment: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { color: color.inkSecondary, fontWeight: "500" },
  selected: { color: color.ink, fontWeight: "600" },
});
