-- Custom Autopilot pace: the weekdays to write on. Additive only.
ALTER TABLE "BlogSeoSettings" ADD COLUMN     "writingDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
