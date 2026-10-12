import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { storage } from "./storage";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // keep for the persisted cache, so a cold start shows yesterday's data at once
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
});

/** The query cache lives in MMKV between launches. Cleared on sign-out. */
export const persister = createSyncStoragePersister({
  storage: {
    getItem: (k) => storage.getString(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.remove(k),
  },
  key: "query-cache",
  throttleTime: 2000,
});
