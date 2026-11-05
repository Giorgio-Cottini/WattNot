// The header of a form sheet: its title and a Done button.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { PRESSED, TARGET, color, space, type } from "@/theme";

export function SheetHeader({
  title,
  onDone,
}: {
  title: string;
  onDone(): void;
}) {
  return (
    <View style={styles.header}>
      <Text style={[type.headline, styles.title]} accessibilityRole="header">
        {title}
      </Text>
      <Pressable
        onPress={onDone}
        style={({ pressed }) => [styles.done, pressed && PRESSED]}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={[type.headline, styles.doneText]}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 56,
    paddingLeft: space.gutter,
    paddingRight: space.s,
    paddingTop: space.m,
    flexDirection: "row",
    alignItems: "center",
  },
  title: { flex: 1, color: color.ink, fontSize: 20, lineHeight: 25 },
  done: {
    minWidth: TARGET,
    minHeight: TARGET,
    paddingHorizontal: space.m,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: color.accent },
});
