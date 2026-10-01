-- A thumbnail has room for a few words, so the cover carries its own short
-- headline instead of the article title. Null on existing posts: those keep
-- drawing the title until one is written for them.
ALTER TABLE "Post" ADD COLUMN "coverTitle" TEXT;
