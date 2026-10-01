-- Only the thumbnail places an uploaded logo on its own. Images inside the
-- article go back to carrying no logo unless one is placed by hand; marking
-- every illustration is rarely what is wanted.
ALTER TABLE "BlogSeoSettings" ALTER COLUMN "inlineLogoPosition" SET DEFAULT 'none';
