// The level word on its colour (PLAN.md section 4): every coloured surface carries
// its word.

import { StyleSheet, Text, View } from "react-native";

import { ROLE_WORD, type PriceRole } from "@/lib/levels.ts";
import { roleColor, type } from "@/theme";

interface Props {
  role: PriceRole;
  small?: boolean;
}

export function Tag({ role, small = false }: Props) {
  const { fill, ink } = roleColor[role];
  return (
    <View
      style={[styles.tag, small && styles.small, { backgroundColor: fill }]}
    >
      <Text style={[type.tag, small && styles.smallText, { color: ink }]}>
        {ROLE_WORD[role]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: 6,
    minHeight: 26,
    paddingHorizontal: 8,
    justifyContent: "center",
  },
  small: { minHeight: 22, paddingHorizontal: 6 },
  smallText: { fontSize: 12 },
});
