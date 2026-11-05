// Root: the data lifecycle mounted once. The first run confirms the zone before
// any navigator mounts; then one stack with the tabs and two form sheets (D18).

import { Stack } from "expo-router";
import { StatusBar, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { FirstRun } from "@/components/FirstRun";
import { useData, useDataLifecycle } from "@/data/appData.ts";
import { color } from "@/theme";

export default function RootLayout() {
  useDataLifecycle();
  const state = useData();
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {!state.ready ? null : state.zone === null ? (
        <FirstRun state={state} />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.ground },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="zone"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [0.7, 1],
              sheetGrabberVisible: true,
            }}
          />
          <Stack.Screen
            name="about"
            options={{
              presentation: "formSheet",
              sheetAllowedDetents: [1],
              sheetGrabberVisible: true,
            }}
          />
        </Stack>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
});
