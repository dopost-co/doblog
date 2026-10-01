-- Thumbnail formats: AI image (default, unchanged), brand template, or both. Additive only.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "thumbnailColors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "thumbnailFormat" TEXT NOT NULL DEFAULT 'generated';
