"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBlogPermission } from "@/src/server/services/blogs/access";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { isManagedPlan } from "@/src/server/services/providers/credentials";
import { normalizeLogoUrl, normalizeStyleReferences } from "@/src/server/services/growth/image-references";
import { competitorDomainsSchema } from "@/lib/autopilot/competitors";
import { MAX_INLINE_IMAGES } from "@/lib/autopilot/image-sizes";
import { schedulePendingDrafts } from "@/src/server/services/growth/planning";
import { articlePathsSchema, imageSizeSchema, logoPositionSchema, thumbnailColorsSchema, thumbnailFormatSchema, thumbnailTypographySchema } from "./service";

const settingsSchema = z.object({
  credentialId: z.string().min(1).nullable(), enabled: z.boolean(),
  targetDomain: z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like example.com").nullable(),
  locationCode: z.number().int().positive(), languageCode: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(1).max(64), competitorDomains: competitorDomainsSchema,
  audience: z.string().trim().max(2000).nullable(), brandVoice: z.string().trim().max(2000).nullable(),
  publishingMode: z.enum(["draft", "review", "auto_publish"]),
  thumbnailEnabled: z.boolean(), inlineImagesEnabled: z.boolean(),
  thumbnailFormat: thumbnailFormatSchema, thumbnailColors: thumbnailColorsSchema, thumbnailTypography: thumbnailTypographySchema,
  logoUrl: z.string().max(2048).nullable(), thumbnailLogoPosition: logoPositionSchema, inlineLogoPosition: logoPositionSchema,
  thumbnailSize: imageSizeSchema, inlineImageSize: imageSizeSchema,
  internalLinksEnabled: z.boolean(), backlinksEnabled: z.boolean(),
  thumbnailReferenceUrls: z.array(z.string().max(2048)).max(2), inlineImageReferenceUrls: z.array(z.string().max(2048)).max(2),
  thumbnailStyle: z.string().trim().max(1000).nullable(), inlineImageStyle: z.string().trim().max(1000).nullable(),
  articleUrlPrefix: z.string().trim().startsWith("/", "Start the article path with /").max(200),
  articlePaths: articlePathsSchema,
  maxInlineImages: z.number().int().min(0).max(MAX_INLINE_IMAGES, `Up to ${MAX_INLINE_IMAGES} images per article`), perRunBudgetUsd: z.number().min(0.001).max(100),
  dailyBudgetUsd: z.number().min(0.001).max(1000), monthlyBudgetUsd: z.number().min(0.001).max(10000),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.targetDomain) ctx.addIssue({ code: "custom", message: "Add your domain before enabling SEO research" });
  if (value.dailyBudgetUsd < value.perRunBudgetUsd) ctx.addIssue({ code: "custom", message: "Daily budget must be at least the per-run budget" });
  if (value.monthlyBudgetUsd < value.dailyBudgetUsd) ctx.addIssue({ code: "custom", message: "Monthly budget must be at least the daily budget" });
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); } catch { ctx.addIssue({ code: "custom", message: "Invalid timezone" }); }
});

/** Autopilot settings are for blog admins; DataForSEO connections are always the owner's. */
async function requireSettingsAccess(blogId: string) {
  const access = await requireBlogPermission(blogId, "autopilot.manage");
  const blog = await prisma.blog.findFirst({
    where: { id: blogId, deletedAt: null },
    select: { id: true, userId: true, name: true, languages: true, user: { select: { plan: true } } },
  });
  if (!blog) throw new ApiError(404, "Blog not found");
  return { ...blog, managed: isManagedPlan(blog.user.plan), canSpend: access.can("account.spending") };
}

/** The owner's choices for research and spending, checked against their own connections. */
async function ownerSpending(blog: { userId: string; managed: boolean }, data: z.infer<typeof settingsSchema>) {
  const micros = (value: number) => Math.round(value * 1_000_000);
  let credentialId: string | null = null;
  if (!blog.managed) {
    const credentials = await prisma.seoProviderCredential.findMany({
      where: { ownerUserId: blog.userId, provider: "dataforseo", verifiedAt: { not: null } },
      select: { id: true },
    });
    // With a single connection there is nothing to choose.
    credentialId = data.credentialId ?? (credentials.length === 1 ? credentials[0].id : null);
    if (credentialId && !credentials.some((item) => item.id === credentialId)) {
      throw new ApiError(403, "Choose a verified DataForSEO connection of the blog owner");
    }
    if (data.enabled && !credentialId) throw new ApiError(400, "Connect DataForSEO in Settings → Providers first");
  }
  return {
    credentialId, enabled: data.enabled,
    perRunBudgetUsdMicros: micros(data.perRunBudgetUsd),
    dailyBudgetUsdMicros: micros(data.dailyBudgetUsd),
    monthlyBudgetUsdMicros: micros(data.monthlyBudgetUsd),
  };
}

export async function getSeoDashboardData(blogId: string) {
  const blog = await requireSettingsAccess(blogId);
  const [credentials, settings] = await Promise.all([
    blog.managed ? [] : prisma.seoProviderCredential.findMany({
      where: { ownerUserId: blog.userId, provider: "dataforseo", verifiedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, loginHint: true },
    }),
    prisma.blogSeoSettings.findUnique({ where: { blogId } }),
  ]);
  // Login hints identify the owner's DataForSEO account; other admins only see the connection names.
  const visibleCredentials = blog.canSpend ? credentials : credentials.map((item) => ({ ...item, loginHint: "" }));
  // Articles to try image settings on (previews).
  const posts = await prisma.post.findMany({ where: { blogId }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } });
  return { plan: blog.managed ? "subscription" as const : "lifetime" as const, credentials: visibleCredentials, settings, languages: blog.languages, blogName: blog.name, posts, canSpend: blog.canSpend };
}

export async function saveBlogSeoSettings(blogId: string, input: unknown) {
  try {
    const blog = await requireSettingsAccess(blogId);
    // The form shows one plain message; field paths are for API clients.
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the settings and try again" };
    const data = parsed.data;
    // Research on/off, the connection and the limits spend the owner's money: other admins keep them as they are.
    const spending = blog.canSpend ? await ownerSpending(blog, data) : await prisma.blogSeoSettings.findUnique({
      where: { blogId },
      select: { credentialId: true, enabled: true, perRunBudgetUsdMicros: true, dailyBudgetUsdMicros: true, monthlyBudgetUsdMicros: true },
    }) ?? {};
    const values = {
      ...spending, targetDomain: data.targetDomain,
      locationCode: data.locationCode, languageCode: data.languageCode, timezone: data.timezone,
      competitorDomains: data.competitorDomains, audience: data.audience || null,
      brandVoice: data.brandVoice || null, publishingMode: data.publishingMode,
      thumbnailEnabled: data.thumbnailEnabled, inlineImagesEnabled: data.inlineImagesEnabled,
      thumbnailFormat: data.thumbnailFormat, thumbnailColors: data.thumbnailColors, thumbnailTypography: data.thumbnailTypography,
      logoUrl: normalizeLogoUrl(blogId, data.logoUrl),
      thumbnailLogoPosition: data.thumbnailLogoPosition, inlineLogoPosition: data.inlineLogoPosition,
      thumbnailSize: data.thumbnailSize, inlineImageSize: data.inlineImageSize,
      internalLinksEnabled: data.internalLinksEnabled, backlinksEnabled: data.backlinksEnabled,
      thumbnailReferenceUrls: normalizeStyleReferences(blogId, data.thumbnailReferenceUrls),
      inlineImageReferenceUrls: normalizeStyleReferences(blogId, data.inlineImageReferenceUrls),
      thumbnailStyle: data.thumbnailStyle || null, inlineImageStyle: data.inlineImageStyle || null,
      articleUrlPrefix: `/${data.articleUrlPrefix.split("/").filter(Boolean).join("/")}`,
      articlePaths: data.articlePaths,
      maxInlineImages: data.maxInlineImages,
    };
    const previous = await prisma.blogSeoSettings.findUnique({ where: { blogId }, select: { timezone: true } });
    await prisma.blogSeoSettings.upsert({ where: { blogId }, create: { blogId, ...values }, update: values });
    // Writing dates are 09:00 in the blog's timezone: move the waiting ones to the new zone.
    if (previous?.timezone && previous.timezone !== values.timezone) await schedulePendingDrafts(blogId, true);
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}
