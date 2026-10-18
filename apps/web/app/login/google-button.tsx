"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";

// The bits of Google Identity Services (https://accounts.google.com/gsi/client) this page uses.
interface GoogleId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: "popup" }): void;
  renderButton(el: HTMLElement, opts: Record<string, string | number>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const el = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT, async: true });
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("Could not load Google sign-in")));
    if (!existing) document.head.appendChild(el);
  });
}

/**
 * "Continue with Google". Hidden until the API says Google sign-in is set up (GOOGLE_CLIENT_ID). Google hands the page
 * an ID token; the API checks it and signs in the matching existing account (it never creates one).
 */
export function GoogleButton({ onSignedIn, onError }: { onSignedIn: () => void; onError: (message: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // Latest callbacks without re-initialising Google on every render.
  const cb = useRef({ onSignedIn, onError });
  cb.current = { onSignedIn, onError };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { clientId } = await api.get<{ clientId: string | null }>("/auth/google");
      if (!clientId || cancelled) return;
      await loadScript();
      if (cancelled || !ref.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        callback: async ({ credential }) => {
          cb.current.onError(null);
          try {
            await api.post("/auth/google", { idToken: credential });
            cb.current.onSignedIn();
          } catch (err) {
            cb.current.onError(errorMessage(err));
          }
        },
      });
      window.google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: ref.current.offsetWidth || 340 });
      setReady(true);
    })().catch(() => {}); // no Google (offline, blocked): the password form still works
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={ready ? "space-y-4" : "hidden"}>
      <div className="flex items-center gap-3 text-[12px] text-fg-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div ref={ref} className="flex min-h-10 w-full justify-center" />
    </div>
  );
}
