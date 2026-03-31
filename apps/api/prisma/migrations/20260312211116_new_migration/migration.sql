/*
  Warnings:

  - Made the column `updatedAt` on table `DocumentPermission` required. This step will fail if there are existing NULL values in that column.

*/

-- ✅ Backfill existing NULLs before NOT NULL constraint
UPDATE "DocumentPermission"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
WHERE "updatedAt" IS NULL;

-- AlterTable
ALTER TABLE "DocumentPermission"
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "DocumentInvite" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "DocumentRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- ✅ Make updatedAt easy to insert by defaulting it
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentInvite_tokenHash_key" ON "DocumentInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "DocumentInvite_documentId_idx" ON "DocumentInvite"("documentId");

-- CreateIndex
CREATE INDEX "DocumentInvite_orgId_idx" ON "DocumentInvite"("orgId");

-- CreateIndex
CREATE INDEX "DocumentInvite_email_idx" ON "DocumentInvite"("email");

-- CreateIndex
CREATE INDEX "DocumentInvite_status_idx" ON "DocumentInvite"("status");

-- CreateIndex
CREATE INDEX "DocumentInvite_expiresAt_idx" ON "DocumentInvite"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentInvite_documentId_email_key" ON "DocumentInvite"("documentId", "email");

-- CreateIndex
CREATE INDEX "DocumentPermission_updatedAt_idx" ON "DocumentPermission"("updatedAt");

-- AddForeignKey
ALTER TABLE "DocumentInvite" ADD CONSTRAINT "DocumentInvite_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentInvite" ADD CONSTRAINT "DocumentInvite_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;