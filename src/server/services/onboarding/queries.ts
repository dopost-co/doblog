import { prisma } from "@/lib/prisma";
import { AUTOPILOT_AUDIENCE_OPTIONS, AUTOPILOT_VOICE_OPTIONS, INLINE_IMAGE_STYLE_OPTIONS, THUMBNAIL_STYLE_OPTIONS } from "@/lib/autopilot/options";
import type { OnboardingFlowId } from "@/lib/onboarding/steps";

/**
 * The first-run onboarding a user gets: invited users (a member of someone
 * else's blog, with no blog of their own) only set their name; everyone else
 * sets up their profile and first blog.
 */
export async function resolveUserFlow(userId: string, email: string | null | undefined): Promise<OnboardingFlowId> {
  const ownsBlog = await prisma.blog.count({ where: { userId, deletedAt: null } });
  if (ownsBlog || !email) return "new-user";
  const invite = await prisma.blogMember.findFirst({
    where: { userEmail: email.toLowerCase().trim(), blog: { deletedAt: null } },
    select: { id: true },
  });
  return invite ? "invited-user" : "new-user";
}

/** Blog-related answers already saved, so a resumed onboarding shows them again. */
export async function blogOnboardingValues(blogId: string) {
  const blog = await prisma.blog.findFirst({ where: { id: blogId, deletedAt: null }, select: { name: true, languages: true, autoSyncTranslations: true, contentMode: true, seoSettings: true } });
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
    ...(blog.contentMode ? { contentMode: blog.contentMode } : {}),
    ...(settings ? {
      thumbnailEnabled: String(settings.thumbnailEnabled),
      inlineImagesEnabled: String(settings.inlineImagesEnabled),
      ...styleAnswer("thumbnail", THUMBNAIL_STYLE_OPTIONS, settings.thumbnailStyle, settings.thumbnailReferenceUrls),
      ...styleAnswer("inline", INLINE_IMAGE_STYLE_OPTIONS, settings.inlineImageStyle, settings.inlineImageReferenceUrls),
    } : {}),
    // Older blogs default to "draft", which is not one of the onboarding choices.
    ...(settings?.publishingMode === "review" || settings?.publishingMode === "auto_publish" ? { publishingMode: settings.publishingMode } : {}),
  };
}

/** Saved image style as onboarding answers: a preset card, or "other" with the text. */
function styleAnswer(prefix: "thumbnail" | "inline", presets: readonly { id: string; value: string }[], style: string | null, references: string[]) {
  const preset = presets.find((option) => option.value === style);
  return {
    [`${prefix}References`]: references,
    ...(style || references.length ? {
      [`${prefix}StyleChoice`]: preset?.id ?? "other",
      [`${prefix}StyleCustom`]: preset ? "" : style ?? "",
    } : {}),
  };
}
