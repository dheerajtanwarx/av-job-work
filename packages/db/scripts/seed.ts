import bcrypt from "bcryptjs";
import { connectDb, db, disconnectDb } from "../src/index.js";

async function main() {
  await connectDb();
  const email = (process.env.OWNER_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "admin123";
  const name = process.env.OWNER_NAME ?? "Owner";

  if (!(await db.user.exists({ email }))) await db.user.create({ email, name, role: "OWNER", passwordHash: await bcrypt.hash(password, 10) });

  await db.settings.update({ _id: 1 }, { $setOnInsert: {} }, { upsert: true });

  if ((await db.product.count()) === 0) {
    await db.product.createMany([
      { name: "Plain Blouse", code: "BLS", unit: "PCS" },
      { name: "Saree", code: "SAR", unit: "PCS" },
      { name: "Shirt", code: "SHT", unit: "PCS" },
      { name: "Dupatta", code: "DUP", unit: "PCS" },
      { name: "Fabric", code: "FAB", unit: "MTR" },
    ]);
  }

  if ((await db.design.count()) === 0) {
    await db.design.createMany([
      { name: "Floral Design", code: "FLR", defaultRatePaise: 2000 },
      { name: "Royal Design", code: "RYL", defaultRatePaise: 2500 },
      { name: "Simple Design", code: "SMP", defaultRatePaise: 1500 },
    ]);
  }

  if ((await db.jobWorkType.count()) === 0) {
    await db.jobWorkType.createMany(["Embroidery", "Printing", "Stitching", "Dyeing", "Finishing", "Cutting", "Other"].map((name) => ({ name, code: name.slice(0, 3).toUpperCase() })));
  }

  console.log(`Seed complete. Login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
