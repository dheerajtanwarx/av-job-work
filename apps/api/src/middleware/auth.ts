import type { UserRole } from "@av/shared";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export const SESSION_COOKIE = "av_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function signSession(user: SessionUser) {
  return jwt.sign(user, env.jwtSecret, { expiresIn: "30d" });
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ message: "Please log in" });
  try {
    const p = jwt.verify(token, env.jwtSecret) as Partial<SessionUser> & { id: string; email: string; name: string };
    // Sessions issued before roles existed belong to the owner.
    req.user = { id: p.id, email: p.email, name: p.name, role: p.role ?? "OWNER" };
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}

/** Roles allowed to do sensitive things (overrides, voids of photos, stock adjustments). */
export const MANAGERS: UserRole[] = ["OWNER", "MANAGER"];
/** Roles that may record work and payments. */
export const WRITERS: UserRole[] = ["OWNER", "MANAGER", "ACCOUNTS", "DATA_ENTRY"];

export const hasRole = (user: SessionUser | undefined, roles: UserRole[]) => !!user && roles.includes(user.role);

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasRole(req.user, roles)) return res.status(403).json({ message: "You don't have permission to do this" });
    next();
  };
}

/** Viewers can read everything but change nothing. */
export function blockViewersFromWriting(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD" && req.user?.role === "VIEWER") return res.status(403).json({ message: "Your account is read-only" });
  next();
}
