// Node only fakes for the data tests. The app never imports this file.

import type { KeyValueStorage } from "./api.ts";

export function memoryStorage(): KeyValueStorage & {
  map: Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => void map.set(key, value),
    getAllKeys: async () => [...map.keys()],
    multiRemove: async (keys) => keys.forEach((key) => map.delete(key)),
  };
}

// Lets every pending promise of the fakes settle.
export function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
