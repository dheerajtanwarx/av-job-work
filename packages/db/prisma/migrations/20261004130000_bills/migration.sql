-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_clientId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceLine" DROP CONSTRAINT "InvoiceLine_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceLine" DROP CONSTRAINT "InvoiceLine_jobItemId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "defaultTaxPercent",
DROP COLUMN "gstin",
DROP COLUMN "invoiceFooter";

-- DropTable
DROP TABLE "Invoice";

-- DropTable
DROP TABLE "InvoiceLine";

-- DropTable
DROP TABLE "Payment";

-- CreateTable
CREATE TABLE "SubBill" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubBillLine" (
    "id" TEXT NOT NULL,
    "subBillId" TEXT NOT NULL,
    "jobItemId" TEXT NOT NULL,
    "designName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "ratePaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,

    CONSTRAINT "SubBillLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MainBill" (
    "id" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "qty" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MainBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubBill_billNumber_key" ON "SubBill"("billNumber");

-- CreateIndex
CREATE INDEX "SubBill_clientId_idx" ON "SubBill"("clientId");

-- CreateIndex
CREATE INDEX "SubBill_jobId_idx" ON "SubBill"("jobId");

-- CreateIndex
CREATE INDEX "SubBill_date_idx" ON "SubBill"("date");

-- CreateIndex
CREATE INDEX "SubBillLine_subBillId_idx" ON "SubBillLine"("subBillId");

-- CreateIndex
CREATE INDEX "SubBillLine_jobItemId_idx" ON "SubBillLine"("jobItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MainBill_billNumber_key" ON "MainBill"("billNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MainBill_jobId_key" ON "MainBill"("jobId");

-- CreateIndex
CREATE INDEX "MainBill_clientId_idx" ON "MainBill"("clientId");

-- CreateIndex
CREATE INDEX "MainBill_date_idx" ON "MainBill"("date");

-- AddForeignKey
ALTER TABLE "SubBill" ADD CONSTRAINT "SubBill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBill" ADD CONSTRAINT "SubBill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBillLine" ADD CONSTRAINT "SubBillLine_subBillId_fkey" FOREIGN KEY ("subBillId") REFERENCES "SubBill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubBillLine" ADD CONSTRAINT "SubBillLine_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MainBill" ADD CONSTRAINT "MainBill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MainBill" ADD CONSTRAINT "MainBill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DELETE FROM "Counter" WHERE "name" = 'invoice';
