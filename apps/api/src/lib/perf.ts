import { randomBytes } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Lightweight diagnostics for "the app gets slow when two people use it". Everything goes to stderr, the only stream
 * Hostinger's runtime log shows. Nothing here changes a response.
 */

/** Random per-process id: two different ids from /health means the host runs more than one copy of the API. */
export const instance = { id: randomBytes(3).toString("hex"), startedAt: Date.now() };

const SLOW_MS = 1000;
let inFlight = 0;

/** Logs every request slower than a second, with how many others were running at the same time. */
export function slowRequestLog(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const busy = ++inFlight;
  res.once("close", () => {
    inFlight--;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // Public paths carry signed tokens: log the route shape, never the token.
    const path = req.path.replace(/^\/public\/(\w+)\/.*/, "/public/$1/…");
    if (ms >= SLOW_MS) console.error(`[slow] ${req.method} ${path} ${res.statusCode} ${Math.round(ms)}ms (in flight at start: ${busy}) [${instance.id}]`);
  });
  next();
}

/**
 * Event-loop delay: high values mean CPU work (PDFs, big JSON, image work) is blocking every other request.
 * Reported once a minute, only when it was noticeable.
 */
export function watchEventLoop() {
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  setInterval(() => {
    const p99 = h.percentile(99) / 1e6;
    const max = h.max / 1e6;
    if (max >= 200) console.error(`[event-loop] p99 ${Math.round(p99)}ms, max ${Math.round(max)}ms over the last minute [${instance.id}]`);
    h.reset();
  }, 60_000).unref();
}
