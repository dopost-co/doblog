-- Brand card text settings (font, size, weight, alignment, blog name). Additive only; null uses the defaults.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "thumbnailTypography" JSONB;
