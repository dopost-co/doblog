-- Linking new articles from related published ones is on by default.
ALTER TABLE "BlogSeoSettings" ALTER COLUMN "backlinksEnabled" SET DEFAULT true;
UPDATE "BlogSeoSettings" SET "backlinksEnabled" = true;
