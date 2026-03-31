-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_actionType_createdAt_idx" ON "AuditLog"("orgId", "actionType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_userId_createdAt_idx" ON "AuditLog"("orgId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_documentId_createdAt_idx" ON "AuditLog"("orgId", "documentId", "createdAt");
