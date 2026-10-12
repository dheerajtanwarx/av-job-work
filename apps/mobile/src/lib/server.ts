import Constants from "expo-constants";
import { storage } from "./storage";

/**
 * Which API the app talks to. Switchable from the login screen (long-press the logo) so the dev build can use
 * the API on this Mac, production, or any other server.
 *
 * - "local": the Mac running Metro, on port 4000. The IP is taken from Metro's own address, so it follows
 *   your Wi-Fi/DHCP without hardcoding anything. Only exists in development.
 * - "production": EXPO_PUBLIC_API_URL baked in at build time, e.g. https://erp.avcreation.in/api
 * - "custom": whatever URL you typed.
 */
export type ServerMode = "local" | "production" | "custom";

const MODE_KEY = "server.mode";
const CUSTOM_KEY = "server.custom";
export const API_PORT = 4000;

const PRODUCTION_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** The Mac's LAN IP as seen by Metro (e.g. "192.168.1.38:8081" → "192.168.1.38"). */
function metroHost(): string | undefined {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  return hostUri?.split(":")[0];
}

export const localUrl = () => {
  const host = metroHost();
  return host ? `http://${host}:${API_PORT}` : undefined;
};
export const productionUrl = () => PRODUCTION_URL || undefined;

export function serverMode(): ServerMode {
  const saved = storage.getString(MODE_KEY) as ServerMode | undefined;
  if (saved) return saved;
  return __DEV__ ? "local" : "production";
}

export function customUrl() {
  return storage.getString(CUSTOM_KEY) ?? "";
}

export function setServer(mode: ServerMode, custom?: string) {
  storage.set(MODE_KEY, mode);
  if (custom !== undefined) storage.set(CUSTOM_KEY, normalizeUrl(custom));
}

export function normalizeUrl(u: string) {
  let url = u.trim().replace(/\/+$/, "");
  if (url && !/^https?:\/\//.test(url)) url = `http://${url}`;
  return url;
}

export function urlFor(mode: ServerMode): string | undefined {
  if (mode === "local") return localUrl();
  if (mode === "production") return productionUrl();
  return customUrl() || undefined;
}

/** The base every request goes to, e.g. "http://192.168.1.38:4000". */
export function apiBase(): string {
  const url = urlFor(serverMode());
  if (!url) throw new Error("No server set. Long-press the logo on the sign-in screen to choose one.");
  return url;
}

/** GET /health with a short timeout. */
export async function pingServer(url: string): Promise<{ ok: true; ms: number } | { ok: false; error: string }> {
  const started = Date.now();
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, error: `Server answered ${res.status}` };
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort|timeout/i.test(msg) ? "No answer in 5 s. Is the API running and on the same Wi-Fi?" : msg };
  }
}

/**
 * The web app's address, for links people open in a browser (the public challan page behind the QR code).
 * Production/custom: the API URL without its /api suffix (the web proxies /api). Local: the Mac on port 3000.
 */
export function webBase(): string | undefined {
  if (process.env.EXPO_PUBLIC_WEB_URL && serverMode() === "production") return process.env.EXPO_PUBLIC_WEB_URL.replace(/\/+$/, "");
  const url = urlFor(serverMode());
  if (!url) return undefined;
  if (/\/api$/.test(url)) return url.replace(/\/api$/, "");
  return url.replace(/:4000$/, ":3000");
}
