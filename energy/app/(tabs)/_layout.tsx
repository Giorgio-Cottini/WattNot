// The two tabs, Prices and Settings, on the native tab bar.
// [iOS-only] SF Symbols. Android equivalent: an `md` icon on each trigger.

import { NativeTabs } from "expo-router/native-tabs";

import { color } from "@/theme";

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={color.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Prices</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
