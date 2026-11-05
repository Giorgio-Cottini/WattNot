// The data store bound to React Native: AsyncStorage, fetch, the device time zone
// and AppState. Screens read it with useData(); the root layout mounts
// useDataLifecycle() once.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { DEFAULT_BASE_URL, fetchDay } from "./api.ts";
import { createDataStore, type DataState } from "./store.ts";

// Inlined at build time. Point it at a local server of lambda/fixtures during
// development.
const BASE_URL = process.env.EXPO_PUBLIC_DATA_BASE_URL || DEFAULT_BASE_URL;

export const dataStore = createDataStore({
  storage: AsyncStorage,
  fetchDay: (zone, date) =>
    fetchDay((url, signal) => fetch(url, { signal }), BASE_URL, zone, date),
  now: Date.now,
  deviceTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  warn: (message) => console.warn(`[data] ${message}`),
});

export function useData(): DataState {
  return useSyncExternalStore(dataStore.subscribe, dataStore.getState);
}

// Refresh on launch and on every return to the foreground. The ticker stops in
// the background; iOS "inactive" (Control Center, a call banner) keeps it.
export function useDataLifecycle(): void {
  useEffect(() => {
    void dataStore.start();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void dataStore.start();
      else if (status === "background") dataStore.stop();
    });
    return () => {
      subscription.remove();
      dataStore.stop();
    };
  }, []);
}
