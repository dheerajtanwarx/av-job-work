-- CreateEnum
CREATE TYPE "BillingPolicy" AS ENUM ('AFTER_EACH_RETURN', 'ON_COMPLETION', 'MANUAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchKind" AS ENUM ('INITIAL', 'REWORK');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "businessName" TEXT NOT NULL DEFAULT 'My Business',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "billingPolicy" "BillingPolicy" NOT NULL DEFAULT 'MANUAL',
    "defaultTaxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "invoiceFooter" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "name" TEXT NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "gstin" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "defaultRatePaise" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "jobDate" DATE NOT NULL,
    "expectedReturnDate" DATE,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "designName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "ratePaise" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "DispatchKind" NOT NULL DEFAULT 'INITIAL',
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchLine" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "jobItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "DispatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "jobItemId" TEXT NOT NULL,
    "okQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "rejectedQty" INTEGER NOT NULL DEFAULT 0,
    "lostQty" INTEGER NOT NULL DEFAULT 0,
    "exceptionReason" TEXT,

    CONSTRAINT "ReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "subtotalPaise" INTEGER NOT NULL,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "jobItemId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "designName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "ratePaise" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");

-- CreateIndex
CREATE INDEX "Job_clientId_idx" ON "Job"("clientId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_jobDate_idx" ON "Job"("jobDate");

-- CreateIndex
CREATE INDEX "JobItem_jobId_idx" ON "JobItem"("jobId");

-- CreateIndex
CREATE INDEX "JobItem_designId_idx" ON "JobItem"("designId");

-- CreateIndex
CREATE INDEX "Dispatch_jobId_idx" ON "Dispatch"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Return_returnNumber_key" ON "Return"("returnNumber");

-- CreateIndex
CREATE INDEX "Return_jobId_idx" ON "Return"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_date_idx" ON "Invoice"("date");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchLine" ADD CONSTRAINT "DispatchLine_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchLine" ADD CONSTRAINT "DispatchLine_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Return" ADD CONSTRAINT "Return_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnLine" ADD CONSTRAINT "ReturnLine_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
