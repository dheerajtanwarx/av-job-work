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

/** A material with plenty of opening stock (challan lines must name the material issued). */
export async function stockedMaterial(agent: Awaited<ReturnType<typeof loggedInAgent>>, name = "Fabric lot", unit = "PCS", openingQty = 100000): Promise<string> {
  const res = await agent.post("/materials").send({ name, unit, openingQty });
  if (res.status !== 201) throw new Error(`material failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}
