import { prisma } from "@av/db";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function loggedInAgent() {
  await prisma.user.create({ data: { email: "test@example.com", name: "Test", passwordHash: await bcrypt.hash("secret", 4) } });
  const agent = request.agent(createApp());
  const res = await agent.post("/auth/login").send({ email: "test@example.com", password: "secret" });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return agent;
}
