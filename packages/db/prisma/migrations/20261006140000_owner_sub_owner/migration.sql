-- Two roles only: OWNER and SUB_OWNER. Every non-owner becomes a sub-owner.
CREATE TYPE "UserRole_new" AS ENUM ('OWNER', 'SUB_OWNER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (CASE WHEN "role"::text = 'OWNER' THEN 'OWNER' ELSE 'SUB_OWNER' END)::"UserRole_new";
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'SUB_OWNER';
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- Who last changed a record by hand, and when.
ALTER TABLE "Client" ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "Product" ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "JobWorkType" ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "Design" ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "Material" ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "Job" ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "Return" ADD COLUMN "editedById" TEXT;
ALTER TABLE "SubBill" ADD COLUMN "voidedById" TEXT, ADD COLUMN "editedAt" TIMESTAMP(3), ADD COLUMN "editedById" TEXT;
ALTER TABLE "Settings" ADD COLUMN "updatedById" TEXT;

-- Backfill from the audit log so existing edits and voids show who did them.
UPDATE "Return" r SET "editedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId" FROM "AuditLog" WHERE "entity" = 'Return' AND "action" = 'update' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = r."id" AND r."editedAt" IS NOT NULL;
UPDATE "SubBill" b SET "voidedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId" FROM "AuditLog" WHERE "entity" = 'SubBill' AND "action" = 'void' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = b."id" AND b."voidedAt" IS NOT NULL;
UPDATE "Client" t SET "editedAt" = a."createdAt", "editedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId", "createdAt" FROM "AuditLog" WHERE "entity" = 'Client' AND "action" = 'update' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = t."id";
UPDATE "Product" t SET "editedAt" = a."createdAt", "editedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId", "createdAt" FROM "AuditLog" WHERE "entity" = 'Product' AND "action" = 'update' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = t."id";
UPDATE "JobWorkType" t SET "editedAt" = a."createdAt", "editedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId", "createdAt" FROM "AuditLog" WHERE "entity" = 'JobWorkType' AND "action" = 'update' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = t."id";
UPDATE "Design" t SET "editedAt" = a."createdAt", "editedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId", "createdAt" FROM "AuditLog" WHERE "entity" = 'Design' AND "action" = 'update' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = t."id";
UPDATE "Material" t SET "editedAt" = a."createdAt", "editedById" = a."userId"
  FROM (SELECT DISTINCT ON ("entityId") "entityId", "userId", "createdAt" FROM "AuditLog" WHERE "entity" = 'Material' AND "action" = 'update' ORDER BY "entityId", "createdAt" DESC) a
  WHERE a."entityId" = t."id";
