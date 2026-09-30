ALTER TABLE "Blog" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Blog_userId_deletedAt_idx" ON "Blog"("userId", "deletedAt");
