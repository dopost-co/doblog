import { prisma } from "@/lib/prisma";
import { AUTOPILOT_AUDIENCE_OPTIONS, AUTOPILOT_VOICE_OPTIONS } from "@/lib/autopilot/options";
import type { OnboardingFlowId } from "@/lib/onboarding/steps";

/**
 * The first-run onboarding a user gets: invited users (a member of someone
 * else's blog, with no blog of their own) only set their name; everyone else
 * sets up their profile and first blog.
 */
export async function resolveUserFlow(userId: string, email: string | null | undefined): Promise<OnboardingFlowId> {
  const ownsBlog = await prisma.blog.count({ where: { userId } });
  if (ownsBlog || !email) return "new-user";
  const invite = await prisma.blogMember.findFirst({ where: { userEmail: email.toLowerCase().trim() }, select: { id: true } });
  return invite ? "invited-user" : "new-user";
}

/** Blog-related answers already saved, so a resumed onboarding shows them again. */
export async function blogOnboardingValues(blogId: string) {
  const blog = await prisma.blog.findUnique({ where: { id: blogId }, select: { name: true, languages: true, autoSyncTranslations: true, seoSettings: true } });
  if (!blog) return {};
  const settings = blog.seoSettings;
  const audiencePreset = AUTOPILOT_AUDIENCE_OPTIONS.find((option) => option.value === settings?.audience);
  const voicePreset = AUTOPILOT_VOICE_OPTIONS.find((option) => option.value === settings?.brandVoice);
  return {
    blogs: blog.name,
    languages: blog.languages,
    // Only a saved multilingual choice counts; otherwise the step suggests syncing.
    ...(blog.languages.length > 1 ? { autoSyncTranslations: String(blog.autoSyncTranslations) } : {}),
    ...(settings?.targetDomain ? { website: settings.targetDomain } : {}),
    ...(settings?.audience ? {
      audienceChoice: audiencePreset?.id ?? "other",
      audienceCustom: audiencePreset ? "" : settings.audience,
    } : {}),
    ...(settings?.brandVoice ? {
      voiceChoice: voicePreset?.id ?? "other",
      brandVoiceCustom: voicePreset ? "" : settings.brandVoice,
    } : {}),
    ...(settings?.draftsPerWeek ? { draftsPerWeek: String(settings.draftsPerWeek) } : {}),
    // Older blogs default to "draft", which is not one of the onboarding choices.
    ...(settings?.publishingMode === "review" || settings?.publishingMode === "auto_publish" ? { publishingMode: settings.publishingMode } : {}),
  };
}
