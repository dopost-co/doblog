-- Where each blog publishes (PublishDestination) and the copy of each post on it (PostPublication).
-- CreateTable
CREATE TABLE "PublishDestination" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "siteUrl" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secret" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusMessage" TEXT,
    "siteInfo" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "syncRequestedAt" TIMESTAMP(3),
    "syncLockedUntil" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPublication" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "remoteId" TEXT,
    "remoteUrl" TEXT,
    "contentHash" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'pending',
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishDestination_blogId_key" ON "PublishDestination"("blogId");

-- CreateIndex
CREATE INDEX "PublishDestination_syncRequestedAt_idx" ON "PublishDestination"("syncRequestedAt");

-- CreateIndex
CREATE INDEX "PostPublication_postId_idx" ON "PostPublication"("postId");

-- CreateIndex
CREATE INDEX "PostPublication_destinationId_state_idx" ON "PostPublication"("destinationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PostPublication_destinationId_postId_key" ON "PostPublication"("destinationId", "postId");

-- AddForeignKey
ALTER TABLE "PublishDestination" ADD CONSTRAINT "PublishDestination_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostPublication" ADD CONSTRAINT "PostPublication_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "PublishDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

