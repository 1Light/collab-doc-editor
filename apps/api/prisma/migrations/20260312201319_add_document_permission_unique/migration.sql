/*
  Warnings:

  - A unique constraint covering the columns `[documentId,principalType,principalId]` on the table `DocumentPermission` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DocumentPermission" ADD COLUMN     "grantedById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DocumentPermission_grantedById_idx" ON "DocumentPermission"("grantedById");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPermission_documentId_principalType_principalId_key" ON "DocumentPermission"("documentId", "principalType", "principalId");

-- AddForeignKey
ALTER TABLE "DocumentPermission" ADD CONSTRAINT "DocumentPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
