import bcrypt from "bcryptjs";
import { prisma } from "../src/index.js";

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "owner@example.com").toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "admin123";
  const name = process.env.OWNER_NAME ?? "Owner";

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash: await bcrypt.hash(password, 10) },
  });

  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  if ((await prisma.product.count()) === 0) {
    await prisma.product.createMany({
      data: [
        { name: "Plain Blouse", code: "BLS", unit: "pcs" },
        { name: "Saree", code: "SAR", unit: "pcs" },
        { name: "Shirt", code: "SHT", unit: "pcs" },
        { name: "Dupatta", code: "DUP", unit: "pcs" },
        { name: "Fabric", code: "FAB", unit: "m" },
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

  console.log(`Seed complete. Login: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
