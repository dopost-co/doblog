-- Article path per language for internal links. Additive only; empty keeps one path for all.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "articlePaths" JSONB NOT NULL DEFAULT '{}';
