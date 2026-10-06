-- Reference photos on challan lines: the item/material sent and the design/sample to make.
CREATE TYPE "JobItemPhotoKind" AS ENUM ('ITEM', 'DESIGN');

CREATE TABLE "JobItemPhoto" (
    "id" TEXT NOT NULL,
    "jobItemId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "kind" "JobItemPhotoKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "uploadedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobItemPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobItemPhoto_jobItemId_idx" ON "JobItemPhoto"("jobItemId");
CREATE INDEX "JobItemPhoto_jobId_idx" ON "JobItemPhoto"("jobId");

ALTER TABLE "JobItemPhoto" ADD CONSTRAINT "JobItemPhoto_jobItemId_fkey" FOREIGN KEY ("jobItemId") REFERENCES "JobItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
