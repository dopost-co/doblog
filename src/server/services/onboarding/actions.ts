"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { slugify } from "@/lib/slug";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { normalizeBlogLanguages } from "@/lib/blog-languages";
import { AUTOPILOT_AUDIENCE_OPTIONS, AUTOPILOT_VOICE_OPTIONS, CONTENT_MODE_OPTIONS, INLINE_IMAGE_STYLE_OPTIONS, THUMBNAIL_STYLE_OPTIONS } from "@/lib/autopilot/options";
import { normalizeWritingDays } from "@/lib/autopilot/writing-days";
import { normalizeStyleReferences } from "@/src/server/services/growth/image-references";
import { BLOG_FLOWS, flowSteps, isOnboardingFlow, nextVisibleStep, type OnboardingFlowId, type OnboardingStepId, type OnboardingValues } from "@/lib/onboarding/steps";
import { blogOnboardingValues, resolveUserFlow } from "./queries";
import { normalizeWebsite } from "@/src/server/services/growth/discovery";
import { analyzeCompetitorBrandVoice, competitorVoiceInstruction } from "@/src/server/services/growth/brand";

/** The blog being set up, once the blog step has created it. */
type Context = { userId: string; blogId: string | null };
/** Blog steps return the id of the blog they created or renamed. */
type Handler = (context: Context, values: OnboardingValues) => Promise<string | void>;

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : [value ?? ""]).map((item) => item.trim()).filter(Boolean);

/** The blog the Autopilot steps configure; it must belong to the user. */
async function onboardingBlog({ userId, blogId }: Context) {
  if (!blogId) throw new ApiError(409, "Create your blog before configuring Autopilot");
  const blog = await prisma.blog.findFirst({ where: { id: blogId, userId, deletedAt: null }, select: { id: true } });
  if (!blog) throw new ApiError(404, "Blog not found");
  return blog;
}

/** A preset or custom image style, plus the uploaded references it should follow. */
function imageStyle(blogId: string, presets: readonly { id: string; value: string }[], choice: string, custom: string, referenceUrls: string[]) {
  const references = normalizeStyleReferences(blogId, referenceUrls);
  if (choice === "other") {
    if (!custom && !references.length) throw new ApiError(400, "Describe the style or add a reference image");
    return { style: custom || null, references };
  }
  const preset = presets.find((option) => option.id === choice);
  if (!preset) throw new ApiError(400, "Choose an image style");
  return { style: preset.value, references };
}

/** What each step saves. Steps without an entry only advance. */
const STEP_HANDLERS: Partial<Record<OnboardingStepId, Handler>> = {
  profile: async ({ userId }, values) => {
    await prisma.user.update({ where: { id: userId }, data: { name: single(values.name) } });
  },
  blogs: async (context, values) => {
    const name = single(values.blogs);
    // Going back to this step renames the blog it created instead of adding another one.
    if (context.blogId) {
      const blog = await onboardingBlog(context);
      await prisma.blog.update({ where: { id: blog.id }, data: { name } });
      return blog.id;
    }
    const existing = await prisma.blog.findMany({ where: { userId: context.userId, deletedAt: null }, select: { slug: true } });
    const slugs = new Set(existing.map((blog) => blog.slug));
    const base = slugify(name) || "blog";
    let slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
    const blog = await prisma.blog.create({ data: { userId: context.userId, name, slug }, select: { id: true } });
    return blog.id;
  },
  "blog-languages": async (context, values) => {
    const blog = await onboardingBlog(context);
    let languages: string[];
    try { languages = normalizeBlogLanguages(list(values.languages)); } catch (error) {
      throw new ApiError(400, error instanceof Error ? error.message : "Choose the blog languages");
    }
    // Keeping translations in sync only makes sense with more than one language.
    const autoSyncTranslations = languages.length > 1 && single(values.autoSyncTranslations) !== "false";
    await prisma.blog.update({ where: { id: blog.id }, data: { languages, autoSyncTranslations } });
    // Autopilot writes in the main language.
    await prisma.blogSeoSettings.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, languageCode: languages[0] },
      update: { languageCode: languages[0] },
    });
  },
  "content-mode": async (context, values) => {
    const blog = await onboardingBlog(context);
    const contentMode = single(values.contentMode);
    if (!CONTENT_MODE_OPTIONS.some((option) => option.id === contentMode)) throw new ApiError(400, "Choose how you’ll use Zenex");
    await prisma.blog.update({ where: { id: blog.id }, data: { contentMode } });
  },
  "autopilot-thumbnails": async (context, values) => {
    const blog = await onboardingBlog(context);
    const thumbnailEnabled = single(values.thumbnailEnabled) !== "false";
    await prisma.blogSeoSettings.upsert({ where: { blogId: blog.id }, create: { blogId: blog.id, thumbnailEnabled }, update: { thumbnailEnabled } });
  },
  "autopilot-thumbnail-style": async (context, values) => {
    const blog = await onboardingBlog(context);
    const { style, references } = imageStyle(blog.id, THUMBNAIL_STYLE_OPTIONS, single(values.thumbnailStyleChoice), single(values.thumbnailStyleCustom), list(values.thumbnailReferences));
    await prisma.blogSeoSettings.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, thumbnailStyle: style, thumbnailReferenceUrls: references },
      update: { thumbnailStyle: style, thumbnailReferenceUrls: references },
    });
  },
  "autopilot-inline-images": async (context, values) => {
    const blog = await onboardingBlog(context);
    const inlineImagesEnabled = single(values.inlineImagesEnabled) !== "false";
    await prisma.blogSeoSettings.upsert({ where: { blogId: blog.id }, create: { blogId: blog.id, inlineImagesEnabled }, update: { inlineImagesEnabled } });
  },
  "autopilot-inline-style": async (context, values) => {
    const blog = await onboardingBlog(context);
    const { style, references } = imageStyle(blog.id, INLINE_IMAGE_STYLE_OPTIONS, single(values.inlineStyleChoice), single(values.inlineStyleCustom), list(values.inlineReferences));
    await prisma.blogSeoSettings.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, inlineImageStyle: style, inlineImageReferenceUrls: references },
      update: { inlineImageStyle: style, inlineImageReferenceUrls: references },
    });
  },
  "autopilot-website": async (context, values) => {
    const blog = await onboardingBlog(context);
    // Setting up Autopilot later on a blog that was written by hand: it now does both.
    await prisma.blog.updateMany({ where: { id: blog.id, contentMode: "manual" }, data: { contentMode: "both" } });
    const targetDomain = normalizeWebsite(single(values.website));
    await prisma.blogSeoSettings.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, targetDomain, discoveryEnabled: true, discoveryFrequency: "weekly", nextDiscoveryAt: new Date() },
      update: { targetDomain, sitemapUrl: null, discoveryEnabled: true, discoveryFrequency: "weekly", nextDiscoveryAt: new Date() },
    });
  },
  "autopilot-audience": async (context, values) => {
    const blog = await onboardingBlog(context);
    const choice = single(values.audienceChoice);
    const preset = AUTOPILOT_AUDIENCE_OPTIONS.find((option) => option.id === choice);
    const audience = choice === "other" ? single(values.audienceCustom) : preset?.value;
    if (!audience) throw new ApiError(400, "Describe who you want to write for");
    await prisma.blogSeoSettings.upsert({ where: { blogId: blog.id }, create: { blogId: blog.id, audience }, update: { audience } });
  },
  "autopilot-voice": async (context, values) => {
    const blog = await onboardingBlog(context);
    const choice = single(values.voiceChoice);
    const preset = AUTOPILOT_VOICE_OPTIONS.find((option) => option.id === choice);
    let brandVoice = choice === "other" ? single(values.brandVoiceCustom) : preset?.value;
    if (choice === "competitor") {
      const website = single(values.competitorUrl);
      if (!website) throw new ApiError(400, "Add the competitor website you want to learn from");
      brandVoice = competitorVoiceInstruction(await analyzeCompetitorBrandVoice(blog.id, website));
    }
    if (!brandVoice) throw new ApiError(400, "Choose or describe a brand voice");
    await prisma.blogSeoSettings.upsert({ where: { blogId: blog.id }, create: { blogId: blog.id, brandVoice }, update: { brandVoice } });
  },
  "autopilot-frequency": async (context, values) => {
    const blog = await onboardingBlog(context);
    const writingDays = normalizeWritingDays(list(values.writingDays));
    if (!writingDays.length) throw new ApiError(400, "Choose at least one day to write on");
    const draftsPerWeek = writingDays.length;
    await prisma.blogSeoSettings.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, discoveryEnabled: true, draftAutomationEnabled: true, writingDays, draftsPerWeek, discoveryTopicsPerRun: Math.max(8, draftsPerWeek * 4), nextDiscoveryAt: new Date() },
      update: { discoveryEnabled: true, draftAutomationEnabled: true, writingDays, draftsPerWeek, discoveryTopicsPerRun: Math.max(8, draftsPerWeek * 4), nextDiscoveryAt: new Date() },
    });
  },
  "autopilot-publishing": async (context, values) => {
    const blog = await onboardingBlog(context);
    const publishingMode = single(values.publishingMode);
    if (!['review', 'auto_publish'].includes(publishingMode)) throw new ApiError(400, "Choose what happens when an article is ready");
    await prisma.blogSeoSettings.upsert({
      where: { blogId: blog.id },
      create: { blogId: blog.id, publishingMode },
      update: { publishingMode },
    });
    revalidatePath(`/dashboard/blogs/${blog.id}/autopilot`);
  },
};

function validate(flow: OnboardingFlowId, stepId: string, values: OnboardingValues) {
  const step = flowSteps(flow).find((item) => item.id === stepId);
  if (!step) throw new ApiError(400, "Unknown onboarding step");
  for (const field of step.fields) {
    const entries = list(values[field.name]);
    if ("required" in field && field.required && entries.length === 0) throw new ApiError(400, `${field.label} is required`);
    const max = "maxLength" in field ? field.maxLength : undefined;
    if (max && entries.some((entry) => entry.length > max)) throw new ApiError(400, `${field.label} is too long`);
  }
  return step;
}

/**
 * Saves one step of a flow. The first-run flows (new-user, invited-user)
 * record progress on the user (onboardingStep) and mark onboarding as
 * completed after the last step; blog flows (BLOG_FLOWS) only set up their blog.
 */
export async function completeOnboardingStep(flowId: string, stepId: string, values: OnboardingValues, blogId: string | null = null) {
  try {
    const session = await getSession();
    if (!session?.user?.id) throw new ApiError(401, "Sign in to continue");
    const userId = session.user.id;
    if (!isOnboardingFlow(flowId)) throw new ApiError(400, "Unknown onboarding");
    // The first-run flow depends on the account, not on what the client says.
    const flow = BLOG_FLOWS.includes(flowId) ? flowId : await resolveUserFlow(userId, session.user.email);
    const step = validate(flow, stepId, values);
    const savedBlogId = (await STEP_HANDLERS[step.id]?.({ userId, blogId }, values)) || blogId;

    // Which step comes next depends on the answers, both saved and just submitted.
    const answers = { ...(savedBlogId ? await blogOnboardingValues(savedBlogId) : {}), ...values };
    const next = nextVisibleStep(flow, step.id, answers);
    if (!BLOG_FLOWS.includes(flow)) {
      await prisma.user.update({
        where: { id: userId },
        data: next ? { onboardingStep: next.id } : { onboardingStep: null, onboardingCompleted: true },
      });
    }
    if (!next) revalidatePath("/dashboard", "layout");
    return { done: !next, nextStep: next?.id ?? null, blogId: savedBlogId };
  } catch (error) { return { error: apiError(error).error }; }
}
