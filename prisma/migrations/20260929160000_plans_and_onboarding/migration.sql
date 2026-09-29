-- Plans: "lifetime" users bring their own provider keys; "subscription" users use the platform's.
ALTER TABLE "User" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'lifetime';
ALTER TABLE "User" ADD COLUMN "openaiApiKeyEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN "openaiKeyHint" TEXT;

-- Onboarding. Existing accounts are already set up, so they skip it.
ALTER TABLE "User" ADD COLUMN "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "onboardingStep" TEXT;
UPDATE "User" SET "onboardingCompleted" = true;

-- Usage paid by the platform's managed DataForSEO account has no user credential.
ALTER TABLE "SeoUsageEntry" ALTER COLUMN "credentialId" DROP NOT NULL;
