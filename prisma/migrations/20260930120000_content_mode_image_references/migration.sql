-- How each blog is used (asked in onboarding) and optional style references
-- for generated thumbnails and in-article images. Additive only.
ALTER TABLE "Blog" ADD COLUMN     "contentMode" TEXT;

ALTER TABLE "BlogSeoSettings" ADD COLUMN     "inlineImageReferenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "thumbnailReferenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
