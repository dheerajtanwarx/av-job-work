-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "emailBills" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "logo" TEXT;

-- AlterTable
ALTER TABLE "SubBill" ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "emailedTo" TEXT;
