-- Expand an OAuth grant from one blog to a user-selected set of blogs.
ALTER TABLE "McpOAuthAuthorizationCode" ADD COLUMN "blogIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "McpOAuthAuthorizationCode" SET "blogIds" = ARRAY["blogId"];
ALTER TABLE "McpOAuthAuthorizationCode" ALTER COLUMN "blogId" DROP NOT NULL;

ALTER TABLE "McpOAuthGrant" ADD COLUMN "blogIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "McpOAuthGrant" SET "blogIds" = ARRAY["blogId"];
ALTER TABLE "McpOAuthGrant" ALTER COLUMN "blogId" DROP NOT NULL;

CREATE UNIQUE INDEX "McpOAuthGrant_clientId_userId_resource_key"
ON "McpOAuthGrant"("clientId", "userId", "resource");
