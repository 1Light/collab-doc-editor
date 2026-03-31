-- AlterEnum
ALTER TYPE "OrgRole" ADD VALUE 'OrgOwner';

-- CreateIndex
CREATE INDEX "OrganizationMember_orgId_orgRole_idx"
ON "OrganizationMember"("orgId", "orgRole");