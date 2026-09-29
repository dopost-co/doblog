/*
  Warnings:

  - You are about to drop the column `imageStyle` on the `BlogSeoSettings` table. All the data in the column will be lost.
  - You are about to drop the column `imagesPerPost` on the `BlogSeoSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BlogSeoSettings" DROP COLUMN "imageStyle",
DROP COLUMN "imagesPerPost";

-- AlterTable
ALTER TABLE "McpOAuthAuthorizationCode" ALTER COLUMN "blogIds" DROP DEFAULT;

-- AlterTable
ALTER TABLE "McpOAuthGrant" ALTER COLUMN "blogIds" DROP DEFAULT;
