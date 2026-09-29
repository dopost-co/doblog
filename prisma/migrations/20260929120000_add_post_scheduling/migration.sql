-- AlterTable
ALTER TABLE "Post" ADD COLUMN "scheduleMessageId" TEXT;

-- CreateIndex
CREATE INDEX "Post_status_publishedAt_idx" ON "Post"("status", "publishedAt");
