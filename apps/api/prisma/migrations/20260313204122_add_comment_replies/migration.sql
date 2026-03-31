-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "parentCommentId" TEXT;

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_idx" ON "Comment"("parentCommentId");

-- CreateIndex
CREATE INDEX "Comment_documentId_parentCommentId_idx" ON "Comment"("documentId", "parentCommentId");

-- CreateIndex
CREATE INDEX "Comment_documentId_createdAt_idx" ON "Comment"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
