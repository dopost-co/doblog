-- Add automatic, review-first content opportunity discovery. Discovery creates
-- plan ideas only; generation and publication remain separate user decisions.
ALTER TABLE "BlogSeoSettings"
ADD COLUMN "sitemapUrl" TEXT,
ADD COLUMN "discoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "discoveryFrequency" TEXT NOT NULL DEFAULT 'weekly',
ADD COLUMN "discoveryTopicsPerRun" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "discoveryRunningAt" TIMESTAMP(3),
ADD COLUMN "nextDiscoveryAt" TIMESTAMP(3),
ADD COLUMN "lastDiscoveryAt" TIMESTAMP(3);

ALTER TABLE "ContentPlanItem"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "rationale" TEXT,
ADD COLUMN "opportunitySnapshot" JSONB;

CREATE TABLE "ContentDiscoveryRun" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'dashboard',
    "status" TEXT NOT NULL DEFAULT 'running',
    "stage" TEXT NOT NULL DEFAULT 'sitemap',
    "domain" TEXT NOT NULL,
    "sitemapUrl" TEXT,
    "sitemapUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "discoveredPages" INTEGER NOT NULL DEFAULT 0,
    "suggestionsAdded" INTEGER NOT NULL DEFAULT 0,
    "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "inputSnapshot" JSONB,
    "outputSnapshot" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ContentDiscoveryRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentDiscoveryRun_blogId_createdAt_idx" ON "ContentDiscoveryRun"("blogId", "createdAt");
CREATE INDEX "ContentDiscoveryRun_status_createdAt_idx" ON "ContentDiscoveryRun"("status", "createdAt");
CREATE INDEX "BlogSeoSettings_discoveryEnabled_nextDiscoveryAt_idx" ON "BlogSeoSettings"("discoveryEnabled", "nextDiscoveryAt");

ALTER TABLE "ContentDiscoveryRun"
ADD CONSTRAINT "ContentDiscoveryRun_blogId_fkey"
FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
