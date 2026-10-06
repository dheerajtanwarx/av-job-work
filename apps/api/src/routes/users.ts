import { prisma, type Prisma } from "@av/db";
import { USER_ROLE_LABEL, userCreateSchema, userUpdateSchema, type ChangeLogRow, type UserRole, type UserRow } from "@av/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { audit, userNames } from "../lib/audit.js";
import { toDate } from "../lib/dates.js";
import { notFound, param, parse, str, unprocessable } from "../lib/http.js";
import { OWNER_ONLY, requireRole } from "../middleware/auth.js";

/** Settings → Users and Settings → Change log. Owner only. */
export const usersRouter = Router();
usersRouter.use(["/users", "/change-log"], requireRole(...OWNER_ONLY));

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
  const users = await prisma.user.findMany({ orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { role: "asc" }, { name: "asc" }] });
  res.json(users.map((u) => toRow(u, req.user?.id)));
});

usersRouter.post("/users", async (req, res) => {
  const input = parse(userCreateSchema, req.body);
  if (await prisma.user.findUnique({ where: { email: input.email } })) throw unprocessable(`${input.email} already has an account`);
  const u = await prisma.user.create({ data: { name: input.name, email: input.email, role: input.role, passwordHash: await bcrypt.hash(input.password, 10) } });
  await audit(prisma, { entity: "User", entityId: u.id, action: "create", summary: `${u.name} (${u.email}) added as ${USER_ROLE_LABEL[u.role]}`, userId: req.user?.id });
  res.status(201).json(toRow(u, req.user?.id));
});

usersRouter.patch("/users/:id", async (req, res) => {
  const id = param(req.params.id);
  const input = parse(userUpdateSchema, req.body);
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw notFound("User");
  const self = id === req.user?.id;

  const data: Prisma.UserUpdateInput = {};
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
  if (losesOwner && (await prisma.user.count({ where: { role: "OWNER", disabledAt: null, id: { not: id } } })) === 0) {
    throw unprocessable("This is the only owner. Make someone else an owner first.");
  }

  const updated = await prisma.user.update({ where: { id }, data });
  await audit(prisma, { entity: "User", entityId: id, action: "update", summary: `${updated.name}: ${changes.join("; ")}`, userId: req.user?.id });
  res.json(toRow(updated, req.user?.id));
});

// ───────── Change log ─────────

const ENTITY_LABEL: Record<string, string> = {
  SubBill: "Payment voucher",
  Job: "Challan",
  Return: "Return",
  Dispatch: "Material issue",
  Client: "Job worker",
  Product: "Product",
  Design: "Design",
  JobWorkType: "Job work type",
  Material: "Material",
  StockMovement: "Stock entry",
  Settings: "Settings",
  User: "User",
  ReturnPhoto: "Photo",
  JobItemPhoto: "Photo",
};

function hrefFor(entity: string, id: string, after: unknown): string | null {
  const materialId = (after as { materialId?: string } | null)?.materialId;
  switch (entity) {
    case "SubBill":
      return `/bills/sub/${id}`;
    case "Job":
      return `/jobs/${id}`;
    case "Return":
      return `/returns/${id}`;
    case "Client":
      return `/clients/${id}`;
    case "Material":
      return `/materials/${id}`;
    case "StockMovement":
      return materialId ? `/materials/${materialId}` : null;
    case "Product":
      return "/products";
    case "Design":
      return "/designs";
    case "JobWorkType":
      return "/job-work-types";
    case "Settings":
      return "/settings";
    case "User":
      return "/settings?tab=users";
    default:
      return null;
  }
}

usersRouter.get("/change-log", async (req, res) => {
  const take = Math.min(200, Math.max(1, Number(str(req.query.take)) || 100));
  const skip = Math.max(0, Number(str(req.query.skip)) || 0);
  const from = str(req.query.from);
  const to = str(req.query.to);
  const kind = str(req.query.kind); // "edits" = changes and voids only
  const where: Prisma.AuditLogWhereInput = {
    entity: str(req.query.entity),
    userId: str(req.query.userId),
    action: kind === "edits" ? { in: ["update", "void", "cancel", "exception"] } : undefined,
    createdAt: from || to ? { gte: from ? toDate(from) : undefined, lt: to ? new Date(toDate(to).getTime() + 86400000) : undefined } : undefined,
  };
  const rows = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: take + 1, skip });
  const more = rows.length > take;
  const page = rows.slice(0, take);
  const names = await userNames(prisma, page.map((r) => r.userId));

  // An edit to a return or payment is also written on its challan, with the same summary plus the reason.
  // Show it once, on the record itself.
  const shown = page.filter(
    (r) =>
      !(
        r.entity === "Job" &&
        r.summary &&
        page.some((o) => o !== r && o.entity !== "Job" && o.userId === r.userId && o.summary && r.summary!.startsWith(o.summary) && Math.abs(o.createdAt.getTime() - r.createdAt.getTime()) < 5000)
      ),
  );

  const out: ChangeLogRow[] = shown.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    entity: r.entity,
    entityLabel: ENTITY_LABEL[r.entity] ?? r.entity,
    action: r.action,
    summary: r.summary,
    reason: r.reason,
    user: r.userId ? (names.get(r.userId) ?? null) : null,
    href: hrefFor(r.entity, r.entityId, r.after),
  }));
  res.json({ rows: out, more });
});
