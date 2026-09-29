-- Languages a blog is written in (the first one is the main language) and the
-- option to keep translation groups in sync automatically. Additive only.
ALTER TABLE "Blog" ADD COLUMN     "autoSyncTranslations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[];

ALTER TABLE "Post" ADD COLUMN     "translationSyncPending" BOOLEAN NOT NULL DEFAULT false;

-- Existing blogs: the languages their posts already use, most used first,
-- falling back to the Autopilot language and then English.
UPDATE "Blog" AS b
SET "languages" = COALESCE(
  (
    SELECT array_agg(p."language" ORDER BY p.n DESC, p."language")
    FROM (
      SELECT "language", count(*) AS n
      FROM "Post"
      WHERE "blogId" = b."id"
      GROUP BY "language"
    ) AS p
  ),
  (SELECT ARRAY[s."languageCode"] FROM "BlogSeoSettings" AS s WHERE s."blogId" = b."id"),
  ARRAY['en']::TEXT[]
);
