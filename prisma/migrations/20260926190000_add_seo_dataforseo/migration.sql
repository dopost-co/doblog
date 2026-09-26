CREATE TABLE "SeoProviderCredential" (
    "id" TEXT NOT NULL, "ownerUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'dataforseo', "label" TEXT NOT NULL,
    "encryptedLogin" TEXT NOT NULL, "encryptedPassword" TEXT NOT NULL,
    "loginHint" TEXT NOT NULL, "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoProviderCredential_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BlogSeoSettings" (
    "id" TEXT NOT NULL, "blogId" TEXT NOT NULL, "credentialId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false, "targetDomain" TEXT,
    "locationCode" INTEGER NOT NULL DEFAULT 2840, "languageCode" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC', "competitorDomains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "audience" TEXT, "brandVoice" TEXT, "publishingMode" TEXT NOT NULL DEFAULT 'draft',
    "imageStyle" TEXT, "imagesPerPost" INTEGER NOT NULL DEFAULT 1,
    "perRunBudgetUsdMicros" INTEGER NOT NULL DEFAULT 250000,
    "dailyBudgetUsdMicros" INTEGER NOT NULL DEFAULT 1000000,
    "monthlyBudgetUsdMicros" INTEGER NOT NULL DEFAULT 20000000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogSeoSettings_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SeoCacheEntry" (
    "id" TEXT NOT NULL, "blogId" TEXT NOT NULL, "endpoint" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL, "response" JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SeoCacheEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SeoUsageEntry" (
    "id" TEXT NOT NULL, "blogId" TEXT NOT NULL, "credentialId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL, "providerTaskId" TEXT, "costUsdMicros" INTEGER NOT NULL DEFAULT 0,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false, "status" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
    CONSTRAINT "SeoUsageEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogSeoSettings_blogId_key" ON "BlogSeoSettings"("blogId");
CREATE INDEX "BlogSeoSettings_credentialId_idx" ON "BlogSeoSettings"("credentialId");
CREATE INDEX "SeoProviderCredential_ownerUserId_provider_idx" ON "SeoProviderCredential"("ownerUserId", "provider");
CREATE UNIQUE INDEX "SeoCacheEntry_blogId_endpoint_payloadHash_key" ON "SeoCacheEntry"("blogId", "endpoint", "payloadHash");
CREATE INDEX "SeoCacheEntry_blogId_expiresAt_idx" ON "SeoCacheEntry"("blogId", "expiresAt");
CREATE INDEX "SeoUsageEntry_blogId_createdAt_idx" ON "SeoUsageEntry"("blogId", "createdAt");
CREATE INDEX "SeoUsageEntry_credentialId_createdAt_idx" ON "SeoUsageEntry"("credentialId", "createdAt");
ALTER TABLE "SeoProviderCredential" ADD CONSTRAINT "SeoProviderCredential_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogSeoSettings" ADD CONSTRAINT "BlogSeoSettings_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlogSeoSettings" ADD CONSTRAINT "BlogSeoSettings_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "SeoProviderCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SeoCacheEntry" ADD CONSTRAINT "SeoCacheEntry_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeoUsageEntry" ADD CONSTRAINT "SeoUsageEntry_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeoUsageEntry" ADD CONSTRAINT "SeoUsageEntry_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "SeoProviderCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
