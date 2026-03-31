-- AlterTable
ALTER TABLE "OrganizationInvite" ADD COLUMN     "orgRole" "OrgRole";

-- CreateIndex
CREATE INDEX "OrganizationInvite_orgId_status_idx" ON "OrganizationInvite"("orgId", "status");

-- CreateIndex
CREATE INDEX "OrganizationInvite_orgId_email_idx" ON "OrganizationInvite"("orgId", "email");
