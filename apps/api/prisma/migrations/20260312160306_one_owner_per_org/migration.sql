-- This is an empty migration.
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationMember_one_owner_per_org"
ON "OrganizationMember" ("orgId")
WHERE "orgRole" = 'OrgOwner';