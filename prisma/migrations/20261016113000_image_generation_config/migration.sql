-- Provider and art-direction defaults shared by thumbnail and post-image generation.
ALTER TABLE "BlogSeoSettings"
ADD COLUMN "imageConceptPrompt" TEXT,
ADD COLUMN "imageModel" TEXT NOT NULL DEFAULT 'gpt-image-2',
ADD COLUMN "imageQuality" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN "imageMode" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN "imageVariants" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "logoWidth" INTEGER NOT NULL DEFAULT 140,
ADD COLUMN "logoMargin" INTEGER NOT NULL DEFAULT 32;
