import { apiBase } from "./server";

/** Same shape as the web's ApiError (apps/web/lib/api.ts): `fieldErrors` maps zod paths to messages on a 422. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: { message?: string; fieldErrors?: Record<string, string>; details?: unknown } = {},
  ) {
    super(message);
  }
  get fieldErrors() {
    return this.body.fieldErrors ?? {};
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Wired by AuthProvider: the token to send, and what to do when the server says the session is over. */
export function configureApi(opts: { token: string | null; onUnauthorized: () => void }) {
  token = opts.token;
  onUnauthorized = opts.onUnauthorized;
}

export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** Absolute URL for an API path, for images/downloads that need the base too. */
export const apiUrl = (path: string) => `${apiBase()}${path}`;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const sentToken = token;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...authHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet or Wi-Fi and try again.");
  }
  // Only a 401 for the session in use ends it: a request that went out before the saved token was loaded must
  // not sign out the session that has since been restored.
  if (res.status === 401 && !path.startsWith("/auth/token") && sentToken && sentToken === token) {
    if (__DEV__) console.log(`[auth] 401 on ${method} ${path}: signing out`);
    onUnauthorized?.();
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? "Something went wrong", data ?? {});
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
