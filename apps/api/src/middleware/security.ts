import type { NextFunction, Request, Response } from "express";
import { rateLimit, type RateLimitRequestHandler } from "express-rate-limit";
import { env } from "../env.js";

// ───────────────────────── Rate limiting ─────────────────────────

/** Rate limits are off under test (suites log in many times) unless a test opts in. */
let rateLimitInTests = false;
export function enableRateLimitInTests(on: boolean) {
  rateLimitInTests = on;
}
const skipRateLimit = () => env.isTest && !rateLimitInTests;

/** Brute-force protection: 10 failed logins per IP per 15 minutes (successful logins don't count). */
export function loginRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { message: "Too many login attempts. Please wait 15 minutes and try again." },
  });
}

/** The public QR challan view: 60 requests per IP per minute. */
export function publicRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: skipRateLimit,
    message: { message: "Too many requests. Please try again in a minute." },
  });
}

// ───────────────────────── CSRF ─────────────────────────

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(req: Request) {
  const set = new Set([originOf(env.webOrigin), originOf(env.publicWebUrl)].filter((o): o is string => !!o));
  // Requests made directly to the API from its own origin.
  const host = req.get("host");
  if (host) set.add(`${req.protocol}://${host}`);
  return set;
}

/**
 * CSRF defence for cookie-authenticated writes (on top of the SameSite=lax session cookie):
 * a non-GET request is rejected when the browser says it is cross-site (`Sec-Fetch-Site: cross-site`), or when
 * its `Origin` (or, without one, `Referer`) is not the web app. Requests without either header (server-to-server,
 * CLI, tests) are allowed – browsers always send Origin on cross-origin POSTs.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const reject = () => res.status(403).json({ message: "This request was blocked because it came from another website." });

  if (req.get("sec-fetch-site") === "cross-site") return reject();
  const origin = req.get("origin");
  const referer = req.get("referer");
  if (!origin && !referer) return next();
  const source = origin ? (origin === "null" ? null : originOf(origin)) : originOf(referer!);
  if (!source || !allowedOrigins(req).has(source)) return reject();
  next();
}
