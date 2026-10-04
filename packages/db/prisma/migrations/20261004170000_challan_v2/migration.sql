-- AV Creation v2: return-level rates & time, photos, materials/stock, amount-based payments, payment terms, roles.
-- Hand-reviewed: every NOT NULL column on existing rows is backfilled first; nothing is dropped without mapping.
-- CreateEnum
CREATE TYPE "PaymentPolicy" AS ENUM ('IMMEDIATE', 'AFTER_EACH_RETURN', 'DAYS_AFTER_RETURN', 'AFTER_COMPLETION', 'MANUAL');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('PCS', 'MTR', 'KG', 'ROLL', 'DOZEN', 'SET');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'ACCOUNTS', 'DATA_ENTRY', 'VIEWER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- AlterEnum
ALTER TYPE "DispatchKind" ADD VALUE 'ADDITIONAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'NEFT';
ALTER TYPE "PaymentMethod" ADD VALUE 'RTGS';

-- DropIndex
DROP INDEX "Return_jobId_idx";

-- DropIndex
DROP INDEX "SubBill_jobId_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "alternatePhone" TEXT,
ADD COLUMN     "pan" TEXT,
ADD COLUMN     "paymentDays" INTEGER,
ADD COLUMN     "paymentPolicy" "PaymentPolicy",
ADD COLUMN     "workerCode" TEXT;

-- Backfill worker codes WK-0001… in creation order and continue the counter from there.
UPDATE "Client" c SET "workerCode" = 'WK-' || lpad(n::text, 4, '0')
FROM (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Client") x WHERE x.id = c.id;
INSERT INTO "Counter" ("name", "next") VALUES ('worker', (SELECT count(*) + 1 FROM "Client"))
ON CONFLICT ("name") DO UPDATE SET "next" = EXCLUDED."next";
ALTER TABLE "Client" ALTER COLUMN "workerCode" SET NOT NULL;

-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "jobWorkTypeId" TEXT;

-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "enteredById" TEXT;

-- AlterTable
ALTER TABLE "DispatchLine" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "jobWorkTypeId" TEXT,
ADD COLUMN     "paymentDays" INTEGER,
ADD COLUMN     "paymentPolicy" "PaymentPolicy",
ADD COLUMN     "publicToken" TEXT;

-- Unguessable token for the QR challan view (2 × 122 random bits).
UPDATE "Job" SET "publicToken" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "Job" ALTER COLUMN "publicToken" SET NOT NULL;

-- AlterTable
ALTER TABLE "JobItem" ADD COLUMN     "jobWorkTypeId" TEXT,
ADD COLUMN     "materialId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "unit" "Unit" NOT NULL DEFAULT 'PCS',
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "MainBill" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "unit_new" "Unit" NOT NULL DEFAULT 'PCS';
UPDATE "Product" SET "unit_new" = CASE lower(trim("unit"))
  WHEN 'pcs' THEN 'PCS' WHEN 'pc' THEN 'PCS' WHEN 'piece' THEN 'PCS' WHEN 'pieces' THEN 'PCS' WHEN 'nos' THEN 'PCS'
  WHEN 'm' THEN 'MTR' WHEN 'mtr' THEN 'MTR' WHEN 'mtrs' THEN 'MTR' WHEN 'meter' THEN 'MTR' WHEN 'meters' THEN 'MTR' WHEN 'metre' THEN 'MTR' WHEN 'metres' THEN 'MTR'
  WHEN 'kg' THEN 'KG' WHEN 'kgs' THEN 'KG' WHEN 'roll' THEN 'ROLL' WHEN 'rolls' THEN 'ROLL'
  WHEN 'dozen' THEN 'DOZEN' WHEN 'dz' THEN 'DOZEN' WHEN 'doz' THEN 'DOZEN' WHEN 'set' THEN 'SET' WHEN 'sets' THEN 'SET'
  ELSE 'PCS' END::"Unit";
INSERT INTO "AuditLog" ("id", "entity", "entityId", "action", "summary", "createdAt")
SELECT 'mig_unit_' || id, 'Product', id, 'update', 'Unit "' || "unit" || '" was not recognised during the upgrade and is now PCS', now()
FROM "Product" WHERE lower(trim("unit")) NOT IN ('pcs','pc','piece','pieces','nos','m','mtr','mtrs','meter','meters','metre','metres','kg','kgs','roll','rolls','dozen','dz','doz','set','sets');
ALTER TABLE "Product" DROP COLUMN "unit";
ALTER TABLE "Product" RENAME COLUMN "unit_new" TO "unit";

-- AlterTable
ALTER TABLE "Return" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing returns were received when they were recorded.
UPDATE "Return" SET "receivedAt" = "createdAt";

-- AlterTable
ALTER TABLE "ReturnLine" ADD COLUMN     "payDamaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payLost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payOverrideReason" TEXT,
ADD COLUMN     "payRejected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ratePaise" INTEGER,
ALTER COLUMN "okQty" SET DEFAULT 0,
ALTER COLUMN "okQty" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "damagedQty" SET DEFAULT 0,
ALTER COLUMN "damagedQty" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "rejectedQty" SET DEFAULT 0,
ALTER COLUMN "rejectedQty" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "lostQty" SET DEFAULT 0,
ALTER COLUMN "lostQty" SET DATA TYPE DECIMAL(14,3);

-- Existing returns take the challan rate as their historical return rate.
UPDATE "ReturnLine" rl SET "ratePaise" = ji."ratePaise" FROM "JobItem" ji WHERE ji.id = rl."jobItemId";
ALTER TABLE "ReturnLine" ALTER COLUMN "ratePaise" SET NOT NULL;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "defaultPaymentDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defaultPaymentPolicy" "PaymentPolicy" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "payDamagedDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payLostDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payRejectedDefault" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Settings" SET "defaultPaymentPolicy" = CASE "billingPolicy"::text
  WHEN 'AFTER_EACH_RETURN' THEN 'AFTER_EACH_RETURN' WHEN 'ON_COMPLETION' THEN 'AFTER_COMPLETION' ELSE 'MANUAL' END::"PaymentPolicy";
ALTER TABLE "Settings" DROP COLUMN "billingPolicy";

-- AlterTable
ALTER TABLE "SubBill" ADD COLUMN     "advanceReason" TEXT,
ADD COLUMN     "enteredById" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "proofKey" TEXT,
ADD COLUMN     "returnId" TEXT;

-- AlterTable
ALTER TABLE "SubBillLine" ALTER COLUMN "qty" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'OWNER';

-- DropEnum
DROP TYPE "BillingPolicy";

-- CreateTable
CREATE TABLE "JobWorkType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobWorkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT,
    "fabricType" TEXT,
    "color" TEXT,
    "designId" TEXT,
    "unit" "Unit" NOT NULL DEFAULT 'PCS',
    "lotNumber" TEXT,
    "rollNumber" TEXT,
    "supplier" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "enteredById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnPhoto" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "returnLineId" TEXT,
    "jobId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "designId" TEXT,
    "storageKey" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "meta" JSONB,
    "uploadedById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipient" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");

-- CreateIndex
CREATE INDEX "Material_name_idx" ON "Material"("name");

-- CreateIndex
CREATE INDEX "Material_lotNumber_idx" ON "Material"("lotNumber");

-- CreateIndex
CREATE INDEX "Material_rollNumber_idx" ON "Material"("rollNumber");

-- CreateIndex
CREATE INDEX "StockMovement_materialId_idx" ON "StockMovement"("materialId");

-- CreateIndex
CREATE INDEX "ReturnPhoto_returnId_idx" ON "ReturnPhoto"("returnId");

-- CreateIndex
CREATE INDEX "ReturnPhoto_jobId_idx" ON "ReturnPhoto"("jobId");

-- CreateIndex
CREATE INDEX "ReturnPhoto_clientId_createdAt_idx" ON "ReturnPhoto"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnPhoto_designId_idx" ON "ReturnPhoto"("designId");

-- CreateIndex
CREATE INDEX "ReturnPhoto_createdAt_idx" ON "ReturnPhoto"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_entity_entityId_idx" ON "NotificationLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_workerCode_key" ON "Client"("workerCode");

-- CreateIndex
CREATE INDEX "Client_phone_idx" ON "Client"("phone");

-- CreateIndex
CREATE INDEX "DispatchLine_jobItemId_idx" ON "DispatchLine"("jobItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_publicToken_key" ON "Job"("publicToken");

-- CreateIndex
CREATE INDEX "JobItem_materialId_idx" ON "JobItem"("materialId");

-- CreateIndex
CREATE INDEX "Return_jobId_voidedAt_idx" ON "Return"("jobId", "voidedAt");

-- CreateIndex
CREATE INDEX "Return_receivedAt_idx" ON "Return"("receivedAt");

-- CreateIndex
CREATE INDEX "Return_date_idx" ON "Return"("date");

-- CreateIndex
CREATE INDEX "ReturnLine_returnId_idx" ON "ReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "ReturnLine_jobItemId_idx" ON "ReturnLine"("jobItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SubBill_idempotencyKey_key" ON "SubBill"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SubBill_jobId_voidedAt_idx" ON "SubBill"("jobId", "voidedAt");

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_jobWorkTypeId_fkey" FOREIGN KEY ("jobWorkTypeId") REFERENCES "JobWorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_jobWorkTypeId_fkey" FOREIGN KEY ("jobWorkTypeId") REFERENCES "JobWorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_jobWorkTypeId_fkey" FOREIGN KEY ("jobWorkTypeId") REFERENCES "JobWorkType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_returnLineId_fkey" FOREIGN KEY ("returnLineId") REFERENCES "ReturnLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnPhoto" ADD CONSTRAINT "ReturnPhoto_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBill" ADD CONSTRAINT "SubBill_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Design lines take their product's unit.
UPDATE "JobItem" ji SET "unit" = p."unit" FROM "Job" j JOIN "Product" p ON p.id = j."productId" WHERE j.id = ji."jobId";
