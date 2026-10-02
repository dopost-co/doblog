-- Blogs that never picked a market researched US searches whatever their
-- language; point them at their language's main market.
UPDATE "BlogSeoSettings" SET "locationCode" = CASE lower(left("languageCode", 2))
  WHEN 'es' THEN 2724 WHEN 'fr' THEN 2250 WHEN 'de' THEN 2276 WHEN 'it' THEN 2380
  WHEN 'pt' THEN 2076 WHEN 'nl' THEN 2528 WHEN 'pl' THEN 2616 WHEN 'sv' THEN 2752
  ELSE "locationCode" END
WHERE "locationCode" = 2840;
