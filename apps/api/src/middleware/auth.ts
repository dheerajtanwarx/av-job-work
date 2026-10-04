import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export const SESSION_COOKIE = "av_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
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
    const p = jwt.verify(token, env.jwtSecret) as SessionUser;
    req.user = { id: p.id, email: p.email, name: p.name };
    next();
  } catch {
    res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}
