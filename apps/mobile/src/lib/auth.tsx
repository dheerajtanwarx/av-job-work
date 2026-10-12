import type { UserRole } from "@av/shared";
import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, configureApi } from "./api";
import { storage } from "./storage";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface Auth {
  /** undefined while the saved session is being read at launch. */
  user: SessionUser | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);
// The JWT lives in the Android Keystore (SecureStore); only the non-secret user profile is cached in MMKV.
const TOKEN_KEY = "session.token";
const USER_KEY = "session.user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  const clear = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    storage.remove(USER_KEY);
    configureApi({ token: null, onUnauthorized: () => {} });
    qc.clear();
    setUser(null);
  }, [qc]);

  const start = useCallback(
    (token: string, u: SessionUser) => {
      configureApi({ token, onUnauthorized: () => void clear() });
      storage.set(USER_KEY, JSON.stringify(u));
      setUser(u);
    },
    [clear],
  );

  // Launch: trust the cached profile at once (instant start, works offline), then refresh the role in the background.
  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const cached = storage.getString(USER_KEY);
      if (!token || !cached) return setUser(null);
      start(token, JSON.parse(cached));
      api
        .get<{ user: SessionUser }>("/auth/me")
        .then((r) => start(token, r.user))
        .catch(() => {}); // offline: keep the cached session; a real 401 signs out via onUnauthorized
    })();
  }, [start]);

  const value = useMemo<Auth>(
    () => ({
      user,
      signIn: async (email, password) => {
        const r = await api.post<{ user: SessionUser; token: string }>("/auth/token", { email: email.trim().toLowerCase(), password });
        await SecureStore.setItemAsync(TOKEN_KEY, r.token);
        start(r.token, r.user);
      },
      signOut: clear,
    }),
    [user, start, clear],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const a = use(AuthContext);
  if (!a) throw new Error("useAuth outside AuthProvider");
  return a;
}

/** Mirrors apps/api/src/middleware/auth.ts: OWNER_ONLY vs MANAGERS (everyone, today). */
export function useRole() {
  const role = useAuth().user?.role;
  return { role, isOwner: role === "OWNER", isManager: role === "OWNER" || role === "SUB_OWNER" };
}
