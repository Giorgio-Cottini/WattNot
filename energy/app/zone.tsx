// The zone sheet (D18): every zone of the picker, the current one checked.

import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetHeader } from "@/components/SheetHeader";
import { ZoneList } from "@/components/ZoneList";
import { dataStore, useData } from "@/data/appData.ts";
import { ZONE_LIST, type ZoneCode } from "@/lib/zones.ts";
import { color, space } from "@/theme";

export default function ZoneSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { zone } = useData();
  const choose = (code: ZoneCode) => {
    if (code !== zone) void dataStore.setZone(code);
    router.back();
  };
  return (
    <View style={styles.sheet}>
      <SheetHeader title="Zone" onDone={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
      >
        <ZoneList
          codes={ZONE_LIST.map((z) => z.code)}
          selected={zone}
          onSelect={choose}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.ground },
});
