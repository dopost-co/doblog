ALTER TABLE "BlogSeoSettings"
  ADD COLUMN "thumbnailStyle" TEXT,
  ADD COLUMN "inlineImageStyle" TEXT,
  ADD COLUMN "maxInlineImages" INTEGER NOT NULL DEFAULT 3;

UPDATE "BlogSeoSettings"
SET
  "inlineImageStyle" = "imageStyle",
  "maxInlineImages" = LEAST(GREATEST("imagesPerPost", 0), 8);

-- Keep the legacy columns for one deployment cycle so the migration can be
-- applied before the new application version without breaking the old one.
