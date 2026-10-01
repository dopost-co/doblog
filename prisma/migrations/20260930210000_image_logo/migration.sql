-- Optional brand logo on generated images. Additive only; "none" keeps images as they are.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "inlineLogoPosition" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "thumbnailLogoPosition" TEXT NOT NULL DEFAULT 'none';
