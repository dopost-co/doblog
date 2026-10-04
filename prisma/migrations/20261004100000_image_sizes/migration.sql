-- Output size preset for Autopilot AI images (thumbnail and images inside the article).
ALTER TABLE "BlogSeoSettings" ADD COLUMN "thumbnailSize" TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE "BlogSeoSettings" ADD COLUMN "inlineImageSize" TEXT NOT NULL DEFAULT 'standard';
