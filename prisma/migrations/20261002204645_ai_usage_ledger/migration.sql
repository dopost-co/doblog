-- CreateTable
CREATE TABLE "AiUsageEntry" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "feature" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "imageInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsdMicros" INTEGER,
    "paidBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiUsageEntry_blogId_createdAt_idx" ON "AiUsageEntry"("blogId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEntry_createdAt_idx" ON "AiUsageEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageEntry" ADD CONSTRAINT "AiUsageEntry_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
