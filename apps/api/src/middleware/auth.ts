import type { UserRole } from "@av/shared";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "@av/db";
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

/**
 * Checks the session cookie, then loads the user so a role change or a disabled account takes effect on the
 * very next request (the cookie lives 30 days).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ message: "Please log in" });
  let id: string;
  try {
    id = (jwt.verify(token, env.jwtSecret) as { id: string }).id;
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, disabledAt: true } });
  if (!u || u.disabledAt) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return res.status(401).json({ message: "Your account is no longer active. Ask the owner for access." });
  }
  req.user = { id: u.id, email: u.email, name: u.name, role: u.role };
  next();
}

/** Everyone signed in does daily work; these are the roles allowed to override and adjust (both, today). */
export const MANAGERS: UserRole[] = ["OWNER", "SUB_OWNER"];
/** Owner-only: users, settings, and changing or voiding payments. */
export const OWNER_ONLY: UserRole[] = ["OWNER"];

export const hasRole = (user: SessionUser | undefined, roles: UserRole[]) => !!user && roles.includes(user.role);

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasRole(req.user, roles)) return res.status(403).json({ message: roles.length === 1 && roles[0] === "OWNER" ? "Only the owner can do this" : "You don't have permission to do this" });
    next();
  };
}
