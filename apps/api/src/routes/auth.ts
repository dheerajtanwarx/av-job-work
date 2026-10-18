import { db } from "@av/db";
import { googleLoginSchema, loginSchema, type UserRole } from "@av/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { env } from "../env.js";
import { verifyGoogleIdToken } from "../lib/google.js";
import { HttpError, parse } from "../lib/http.js";
import { requireAuth, SESSION_COOKIE, setSessionCookie, signSession } from "../middleware/auth.js";

export const authRouter = Router();

function sessionFor(user: { id: string; email: string; name: string; role: UserRole; disabledAt?: Date | null }) {
  if (user.disabledAt) throw new HttpError(403, "This account has been turned off. Ask the owner for access.");
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Checks the credentials and returns the session for a login, or throws 401/403. */
async function authenticate(body: unknown) {
  const { email, password } = parse(loginSchema, body);
  const user = await db.user.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, "Email or password is incorrect");
  return sessionFor(user);
}

/**
 * "Continue with Google". Only signs in people who already have an account here (matched by their verified Google
 * email); it never creates one, so a stranger's Gmail gets nowhere. The owner adds users as before.
 */
async function authenticateGoogle(body: unknown) {
  const { idToken } = parse(googleLoginSchema, body);
  const email = await verifyGoogleIdToken(idToken);
  const user = await db.user.findOne({ email });
  if (!user) throw new HttpError(403, `No account uses ${email}. Ask the owner to add you, then try again.`);
  return sessionFor(user);
}

/** Tells the login screens whether to show the Google button, and which client ID to ask Google for. */
authRouter.get("/google", (_req, res) => {
  res.json({ clientId: env.googleClientId ?? null });
});

authRouter.post("/google", async (req, res) => {
  const session = await authenticateGoogle(req.body);
  setSessionCookie(res, signSession(session));
  res.json({ user: session });
});

/** For the mobile app: the token comes back in the body, like /auth/token. */
authRouter.post("/google/token", async (req, res) => {
  const session = await authenticateGoogle(req.body);
  res.json({ user: session, token: signSession(session) });
});

authRouter.post("/login", async (req, res) => {
  const session = await authenticate(req.body);
  setSessionCookie(res, signSession(session));
  res.json({ user: session });
});

/** For the mobile app: the same login, but the token comes back in the body (sent later as `Authorization: Bearer`). */
authRouter.post("/token", async (req, res) => {
  const session = await authenticate(req.body);
  res.json({ user: session, token: signSession(session) });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
