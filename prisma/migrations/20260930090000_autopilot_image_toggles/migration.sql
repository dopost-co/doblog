-- Autopilot can skip the thumbnail or the images inside the article. Additive only.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "inlineImagesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "thumbnailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Blogs that already asked for zero images inside articles keep that choice.
UPDATE "BlogSeoSettings" SET "inlineImagesEnabled" = false WHERE "maxInlineImages" = 0;
