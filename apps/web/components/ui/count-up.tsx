"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** True when the viewer asked the OS for less motion; every animation here falls back to its end state. */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Tweens from the previously shown value to `target` (from 0 on first mount), so a period change rolls the
 * figure instead of snapping it.
 */
export function useCountUp(target: number, duration = 900) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? target : 0);
  const from = useRef(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    if (start === target) return;
    let raf = 0;
    let t0: number | null = null;
    const step = (now: number) => {
      t0 ??= now;
      const p = Math.min(1, (now - t0) / duration);
      const v = p === 1 ? target : start + (target - start) * easeOut(p);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced]);

  return shown;
}

/**
 * A number that counts up to its value. In-between frames go through `tween` (default: `format` of the value
 * rounded to a whole number) so decimals don't flicker; the settled figure is `format(value)`. Screen readers
 * get the final figure only.
 */
export function CountUp({ value, format = String, tween, duration }: { value: number; format?: (n: number) => string; tween?: (n: number) => string; duration?: number }) {
  const shown = useCountUp(value, duration);
  return (
    <>
      <span aria-hidden>{shown === value ? format(value) : (tween ?? ((n: number) => format(Math.round(n))))(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
