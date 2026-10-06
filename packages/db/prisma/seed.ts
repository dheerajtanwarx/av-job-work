import bcrypt from "bcryptjs";
import { prisma } from "../src/index.js";

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "admin123";
  const name = process.env.OWNER_NAME ?? "Owner";

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role: "OWNER", passwordHash: await bcrypt.hash(password, 10) },
  });

  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({
      data: [
        { name: "Plain Blouse", code: "BLS", unit: "PCS" },
        { name: "Saree", code: "SAR", unit: "PCS" },
        { name: "Shirt", code: "SHT", unit: "PCS" },
        { name: "Dupatta", code: "DUP", unit: "PCS" },
        { name: "Fabric", code: "FAB", unit: "MTR" },
      ],
    });
  }

  if ((await prisma.design.count()) === 0) {
    await prisma.design.createMany({
      data: [
        { name: "Floral Design", code: "FLR", defaultRatePaise: 2000 },
        { name: "Royal Design", code: "RYL", defaultRatePaise: 2500 },
        { name: "Simple Design", code: "SMP", defaultRatePaise: 1500 },
      ],
    });
  }

  if ((await prisma.jobWorkType.count()) === 0) {
    await prisma.jobWorkType.createMany({
      data: ["Embroidery", "Printing", "Stitching", "Dyeing", "Finishing", "Cutting", "Other"].map((name) => ({ name, code: name.slice(0, 3).toUpperCase() })),
    });
  }

  console.log(`Seed complete. Login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
