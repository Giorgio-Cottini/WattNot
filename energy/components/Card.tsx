// A white card on the grey ground: the frame of every block of a page.

import { StyleSheet, View, type ViewProps } from "react-native";

import { color, radius, space } from "@/theme";

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    padding: space.l,
  },
});
