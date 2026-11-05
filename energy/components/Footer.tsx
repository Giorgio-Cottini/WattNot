// Legend, caption and credit (D17, PLAN.md section 2 credits). "Updated" shows
// only while a day is offline (D28).

import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { CAPTION, LICENCE_URL } from "@/lib/format.ts";
import { ROLE_WORD, type PriceRole } from "@/lib/levels.ts";
import {
  PRESSED,
  ROLE_ORDER,
  TARGET,
  color,
  roleColor,
  space,
  type,
} from "@/theme";

interface Props {
  roles: ReadonlySet<PriceRole>;
  notes: string[];
  updated: string | null;
}

export function Footer({ roles, notes, updated }: Props) {
  const shown = ROLE_ORDER.filter((r) => roles.has(r));
  return (
    <View style={styles.footer}>
      {shown.length > 0 && (
        <View style={styles.legend}>
          {shown.map((r) => (
            <View key={r} style={styles.item}>
              <View
                style={[styles.swatch, { backgroundColor: roleColor[r].fill }]}
              />
              <Text style={[type.footnote, styles.ink]}>{ROLE_WORD[r]}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={[type.caption, styles.secondary]}>
        {CAPTION}
        {notes.length > 0 ? ` ${notes.join(" ")}` : ""}
      </Text>
      <Pressable
        onPress={() => void Linking.openURL(LICENCE_URL)}
        accessibilityRole="link"
        style={({ pressed }) => [styles.link, pressed && PRESSED]}
      >
        <Text style={[type.caption, styles.ink, styles.underline]}>
          Licence: CC BY 4.0
        </Text>
      </Pressable>
      {updated && (
        <Text style={[type.caption, styles.secondary]}>Updated {updated}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The page carries the gutter; the footer aligns with the page header.
  footer: { paddingHorizontal: space.xs, gap: space.s },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: space.l,
    rowGap: space.xs,
    marginBottom: space.s,
  },
  item: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12 },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
  link: {
    minHeight: TARGET,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  underline: { textDecorationLine: "underline" },
});
