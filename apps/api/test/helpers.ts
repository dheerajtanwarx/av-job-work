import { db } from "@av/db";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";

/** Empties every collection (indexes stay, so unique keys keep guarding the concurrency tests). */
export async function resetDb() {
  await Promise.all(Object.values(db).map((c) => c.deleteMany({})));
}

export async function loggedInAgent() {
  return agentAs("test@example.com", "OWNER", "Test");
}

/** A new user with this role, logged in. */
export async function agentAs(email: string, role: "OWNER" | "SUB_OWNER", name: string = role === "OWNER" ? "Owner" : "Sub-owner") {
  await db.user.create({ email, name, role, passwordHash: await bcrypt.hash("secret", 4) });
  const agent = request.agent(createApp());
  const res = await agent.post("/auth/login").send({ email, password: "secret" });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return agent;
}

/** A material with plenty of opening stock (challan lines must name the material issued). */
export async function stockedMaterial(agent: Awaited<ReturnType<typeof loggedInAgent>>, name = "Fabric lot", unit = "PCS", openingQty = 100000): Promise<string> {
  const res = await agent.post("/materials").send({ name, unit, openingQty });
  if (res.status !== 201) throw new Error(`material failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}
