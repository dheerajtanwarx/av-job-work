-- Worker profile: kind of work, profile photo and Aadhaar images.
CREATE TYPE "WorkerDocumentKind" AS ENUM ('PHOTO', 'AADHAAR_FRONT', 'AADHAAR_BACK');

ALTER TABLE "Client" ADD COLUMN "workItems" TEXT,
ADD COLUMN "photoId" TEXT,
ADD COLUMN "aadhaarFrontId" TEXT,
ADD COLUMN "aadhaarBackId" TEXT;

CREATE TABLE "WorkerDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "WorkerDocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "displayKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkerDocument_clientId_idx" ON "WorkerDocument"("clientId");

ALTER TABLE "WorkerDocument" ADD CONSTRAINT "WorkerDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
