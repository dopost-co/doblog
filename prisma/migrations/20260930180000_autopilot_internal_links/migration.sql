-- Internal linking for Autopilot articles. Additive only.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "backlinksEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "internalLinksEnabled" BOOLEAN NOT NULL DEFAULT true;
