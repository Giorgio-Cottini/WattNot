// The zones as a grouped list: the 8 with prices, then the 9 that are not
// available yet (D01b). Used by the zone sheet and the first run.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { ZONES, type Zone, type ZoneCode } from "@/lib/zones.ts";
import { color, space, type } from "@/theme";

import { Icon } from "./Icon";

interface Props {
  codes: readonly ZoneCode[];
  selected: ZoneCode | null;
  onSelect(code: ZoneCode): void;
}

export function ZoneList({ codes, selected, onSelect }: Props) {
  const zones = codes.map((c) => ZONES[c]);
  const covered = zones.filter((z) => z.covered);
  const uncovered = zones.filter((z) => !z.covered);
  return (
    <View>
      {covered.length > 0 && (
        <Group
          title="With prices"
          zones={covered}
          selected={selected}
          onSelect={onSelect}
        />
      )}
      {uncovered.length > 0 && (
        <Group
          title="Not available yet"
          note="No licensed prices yet. For these zones WattNot links to Nord Pool's public page."
          zones={uncovered}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </View>
  );
}

function Group({
  title,
  note,
  zones,
  selected,
  onSelect,
}: {
  title: string;
  note?: string;
  zones: Zone[];
  selected: ZoneCode | null;
  onSelect(code: ZoneCode): void;
}) {
  return (
    <View style={styles.group}>
      <Text style={[type.footnote, styles.title]} accessibilityRole="header">
        {title}
      </Text>
      {note && <Text style={[type.footnote, styles.note]}>{note}</Text>}
      {zones.map((z) => {
        const on = z.code === selected;
        return (
          <Pressable
            key={z.code}
            onPress={() => onSelect(z.code)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${z.name}, ${z.shownCode}${z.covered ? "" : ", not available yet"}`}
          >
            <View style={styles.names}>
              <Text style={[type.body, styles.ink]}>{z.name}</Text>
              <Text style={[type.footnote, styles.secondary]}>
                {z.shownCode}
              </Text>
            </View>
            {on && <Icon name="checkmark" size={18} color={color.accent} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.xl },
  title: {
    color: color.inkSecondary,
    fontWeight: "600",
    paddingHorizontal: space.gutter,
    marginBottom: space.xs,
  },
  note: {
    color: color.inkSecondary,
    paddingHorizontal: space.gutter,
    marginBottom: space.s,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: space.gutter,
    paddingVertical: space.s,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  pressed: { backgroundColor: color.accentSoft },
  names: { flex: 1 },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
});
