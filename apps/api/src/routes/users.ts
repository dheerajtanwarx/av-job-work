import { db, type User } from "@av/db";
import { USER_ROLE_LABEL, userCreateSchema, userUpdateSchema, type UserRole, type UserRow } from "@av/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { audit } from "../lib/audit.js";
import { notFound, param, parse, str, unprocessable } from "../lib/http.js";
import { OWNER_ONLY, requireRole } from "../middleware/auth.js";

/** Settings → Users. Owner only. */
export const usersRouter = Router();
usersRouter.use("/users", requireRole(...OWNER_ONLY));

const toRow = (u: { id: string; name: string; email: string; role: UserRole; disabledAt: Date | null; createdAt: Date }, me?: string): UserRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  disabled: !!u.disabledAt,
  createdAt: u.createdAt.toISOString(),
  isYou: u.id === me,
});

usersRouter.get("/users", async (req, res) => {
  // Ascending puts unset (null) disabledAt first, i.e. active users first.
  const users = await db.user.find({}, { sort: { disabledAt: 1, role: 1, name: 1 } });
  res.json(users.map((u) => toRow(u, req.user?.id)));
});

usersRouter.post("/users", async (req, res) => {
  const input = parse(userCreateSchema, req.body);
  if (await db.user.exists({ email: input.email })) throw unprocessable(`${input.email} already has an account`);
  const u = await db.user.create({ name: input.name, email: input.email, role: input.role, passwordHash: await bcrypt.hash(input.password, 10) });
  await audit(db, { entity: "User", entityId: u.id, action: "create", summary: `${u.name} (${u.email}) added as ${USER_ROLE_LABEL[u.role]}`, userId: req.user?.id });
  res.status(201).json(toRow(u, req.user?.id));
});

usersRouter.patch("/users/:id", async (req, res) => {
  const id = param(req.params.id);
  const input = parse(userUpdateSchema, req.body);
  const u = await db.user.findById(id);
  if (!u) throw notFound("User");
  const self = id === req.user?.id;

  const data: Partial<Pick<User, "name" | "role" | "disabledAt" | "passwordHash">> = {};
  const changes: string[] = [];
  if (input.name && input.name !== u.name) {
    data.name = input.name;
    changes.push(`name ${u.name} → ${input.name}`);
  }
  if (input.role && input.role !== u.role) {
    data.role = input.role;
    changes.push(`role ${USER_ROLE_LABEL[u.role]} → ${USER_ROLE_LABEL[input.role]}`);
  }
  if (input.disabled !== undefined && input.disabled !== !!u.disabledAt) {
    if (self && input.disabled) throw unprocessable("You can't turn off your own account");
    data.disabledAt = input.disabled ? new Date() : null;
    changes.push(input.disabled ? "access turned off" : "access turned back on");
  }
  if (input.password) {
    data.passwordHash = await bcrypt.hash(input.password, 10);
    changes.push("password reset");
  }
  if (!changes.length) return res.json(toRow(u, req.user?.id));

  // There must always be at least one owner who can log in.
  const losesOwner = u.role === "OWNER" && !u.disabledAt && ((data.role && data.role !== "OWNER") || data.disabledAt);
  if (losesOwner && (await db.user.count({ role: "OWNER", disabledAt: null, _id: { $ne: id } })) === 0) {
    throw unprocessable("This is the only owner. Make someone else an owner first.");
  }

  const updated = (await db.user.update(id, data))!;
  await audit(db, { entity: "User", entityId: id, action: "update", summary: `${updated.name}: ${changes.join("; ")}`, userId: req.user?.id });
  res.json(toRow(updated, req.user?.id));
});
