-- Keep why a DataForSEO request failed, so failures are visible instead of silent.
ALTER TABLE "SeoUsageEntry" ADD COLUMN "error" TEXT;
