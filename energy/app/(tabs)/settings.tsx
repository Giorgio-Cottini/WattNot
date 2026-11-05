// Settings: the zone, and About. Both open as sheets over the tabs.

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { useData } from "@/data/appData.ts";
import { ZONES } from "@/lib/zones.ts";
import { color, space, type } from "@/theme";

export default function SettingsTab() {
  const router = useRouter();
  const { zone } = useData();
  const current = zone ? ZONES[zone] : null;
  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <Text style={[type.zone, styles.ink]} accessibilityRole="header">
        Settings
      </Text>
      <Card style={styles.list}>
        <Row
          label="Zone"
          value={current ? `${current.name} · ${current.shownCode}` : undefined}
          onPress={() => router.push("/zone")}
        />
        <Row label="About WattNot" onPress={() => router.push("/about")} last />
      </Card>
      <Text style={[type.footnote, styles.secondary, styles.version]}>
        Version {Constants.expoConfig?.version ?? "unknown"}
      </Text>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  onPress,
  last = false,
}: {
  label: string;
  value?: string;
  onPress(): void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        styles.row,
        !last && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.flex}>
        <Text style={[type.body, styles.ink]}>{label}</Text>
        {value && <Text style={[type.subhead, styles.secondary]}>{value}</Text>}
      </View>
      <Icon name="chevron.right" size={16} color={color.inkSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.gutter, paddingTop: space.xl, gap: space.l },
  list: { padding: 0, overflow: "hidden" },
  row: {
    minHeight: 56,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    flexDirection: "row",
    alignItems: "center",
    gap: space.m,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  pressed: { backgroundColor: color.control },
  flex: { flex: 1 },
  version: { paddingHorizontal: space.xs },
  ink: { color: color.ink },
  secondary: { color: color.inkSecondary },
});
