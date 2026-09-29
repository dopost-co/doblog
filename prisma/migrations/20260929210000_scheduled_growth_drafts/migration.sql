-- Give Growth a concrete, review-first schedule: ideas can become drafts on a
-- visible cadence, while publication remains a separate editorial decision.
ALTER TABLE "BlogSeoSettings"
ADD COLUMN "draftAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "draftsPerWeek" INTEGER NOT NULL DEFAULT 2;

CREATE INDEX "ContentPlanItem_status_scheduledFor_idx"
ON "ContentPlanItem"("status", "scheduledFor");
