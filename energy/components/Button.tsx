// The two buttons of the app: a navy block for the one main action of a view, and
// a navy outline for the others.

import { Pressable, StyleSheet, Text } from "react-native";

import { PRESSED, TARGET, color, radius, type } from "@/theme";

interface Props {
  label: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityHint?: string;
}

export function Button({
  label,
  onPress,
  primary = false,
  accessibilityHint,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        pressed && PRESSED,
      ]}
    >
      <Text
        style={[
          type.headline,
          { color: primary ? color.onAccent : color.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TARGET + 6,
    paddingHorizontal: 20,
    borderRadius: radius.block,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: color.accent },
  secondary: { borderWidth: 1.5, borderColor: color.accent },
});
