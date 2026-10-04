import { prisma } from "@av/db";
import { loginSchema } from "@av/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { HttpError, parse } from "../lib/http.js";
import { requireAuth, SESSION_COOKIE, setSessionCookie, signSession } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, "Email or password is incorrect");
  const session = { id: user.id, email: user.email, name: user.name };
  setSessionCookie(res, signSession(session));
  res.json({ user: session });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
