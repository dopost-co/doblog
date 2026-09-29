-- Autopilot always replenishes the queue for blogs that already have automatic
-- writing configured. Preserve their existing due date when one is present.
UPDATE "BlogSeoSettings"
SET
  "discoveryEnabled" = true,
  "nextDiscoveryAt" = COALESCE("nextDiscoveryAt", CURRENT_TIMESTAMP)
WHERE
  "targetDomain" IS NOT NULL
  AND "draftAutomationEnabled" = true
  AND "draftsPerWeek" > 0;
