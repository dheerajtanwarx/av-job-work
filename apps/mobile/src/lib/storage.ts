import { createMMKV } from "react-native-mmkv";

/** Fast synchronous key-value store for preferences, drafts and the query cache. Never the auth token (see auth.tsx). */
export const storage = createMMKV({ id: "av-job-work" });

export const prefs = {
  getJSON<T>(key: string): T | undefined {
    const raw = storage.getString(key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  },
  setJSON(key: string, value: unknown) {
    storage.set(key, JSON.stringify(value));
  },
  remove(key: string) {
    storage.remove(key);
  },
};
