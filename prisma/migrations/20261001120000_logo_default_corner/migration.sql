-- A logo left unplaced is never drawn, which made an uploaded logo look
-- ignored. New settings start it in the top-left corner; existing rows keep
-- whatever position their owner already chose, including "none".
ALTER TABLE "BlogSeoSettings" ALTER COLUMN "thumbnailLogoPosition" SET DEFAULT 'top-left';
ALTER TABLE "BlogSeoSettings" ALTER COLUMN "inlineLogoPosition" SET DEFAULT 'top-left';
