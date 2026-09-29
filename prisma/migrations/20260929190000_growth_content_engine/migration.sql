-- Persist the editorial plan, generation attempts, generated media and each
-- post's canonical SEO target. Existing posts remain untouched.
ALTER TABLE "BlogSeoSettings"
ADD COLUMN "articleUrlPrefix" TEXT NOT NULL DEFAULT '/blog';

CREATE TABLE "ContentPlanItem" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "postId" TEXT,
    "primaryKeyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "secondaryKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "intent" TEXT,
    "cluster" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "scheduledFor" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentPlanItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "planItemId" TEXT,
    "postId" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'dashboard',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT 'article-v1',
    "inputSnapshot" JSONB,
    "outputSnapshot" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "postId" TEXT,
    "generationRunId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'inline',
    "origin" TEXT NOT NULL DEFAULT 'generated',
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "prompt" TEXT,
    "revisedPrompt" TEXT,
    "altText" TEXT,
    "caption" TEXT,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PostSeoTarget" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "secondaryKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "intent" TEXT,
    "cluster" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "brief" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostSeoTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPlanItem_postId_key" ON "ContentPlanItem"("postId");
CREATE UNIQUE INDEX "ContentPlanItem_blogId_normalizedKeyword_language_key" ON "ContentPlanItem"("blogId", "normalizedKeyword", "language");
CREATE INDEX "ContentPlanItem_blogId_status_scheduledFor_idx" ON "ContentPlanItem"("blogId", "status", "scheduledFor");
CREATE INDEX "ContentPlanItem_postId_idx" ON "ContentPlanItem"("postId");
CREATE INDEX "GenerationRun_blogId_createdAt_idx" ON "GenerationRun"("blogId", "createdAt");
CREATE INDEX "GenerationRun_planItemId_createdAt_idx" ON "GenerationRun"("planItemId", "createdAt");
CREATE INDEX "GenerationRun_postId_idx" ON "GenerationRun"("postId");
CREATE UNIQUE INDEX "MediaAsset_url_key" ON "MediaAsset"("url");
CREATE INDEX "MediaAsset_blogId_createdAt_idx" ON "MediaAsset"("blogId", "createdAt");
CREATE INDEX "MediaAsset_postId_idx" ON "MediaAsset"("postId");
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");
CREATE UNIQUE INDEX "PostSeoTarget_postId_key" ON "PostSeoTarget"("postId");
CREATE UNIQUE INDEX "PostSeoTarget_blogId_normalizedKeyword_language_key" ON "PostSeoTarget"("blogId", "normalizedKeyword", "language");
CREATE INDEX "PostSeoTarget_blogId_cluster_idx" ON "PostSeoTarget"("blogId", "cluster");

ALTER TABLE "ContentPlanItem" ADD CONSTRAINT "ContentPlanItem_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPlanItem" ADD CONSTRAINT "ContentPlanItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "ContentPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostSeoTarget" ADD CONSTRAINT "PostSeoTarget_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostSeoTarget" ADD CONSTRAINT "PostSeoTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
