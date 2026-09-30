-- Autopilot now always writes on chosen weekdays (0 = Sunday … 6 = Saturday).
-- Blogs that used a weekly pace get the same count spread evenly over the week.
UPDATE "BlogSeoSettings"
SET "writingDays" = CASE "draftsPerWeek"
  WHEN 1 THEN ARRAY[1]
  WHEN 2 THEN ARRAY[1, 4]
  WHEN 3 THEN ARRAY[1, 3, 5]
  WHEN 4 THEN ARRAY[1, 2, 4, 5]
  WHEN 5 THEN ARRAY[1, 2, 3, 4, 5]
  WHEN 6 THEN ARRAY[1, 2, 3, 4, 5, 6]
  WHEN 7 THEN ARRAY[0, 1, 2, 3, 4, 5, 6]
  ELSE ARRAY[1, 3, 5]
END
WHERE cardinality("writingDays") = 0;

UPDATE "BlogSeoSettings" SET "draftsPerWeek" = cardinality("writingDays") WHERE "draftsPerWeek" <> cardinality("writingDays");
