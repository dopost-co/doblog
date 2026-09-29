"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { isManagedPlan } from "@/src/server/services/providers/credentials";

const settingsSchema = z.object({
  credentialId: z.string().min(1).nullable(), enabled: z.boolean(),
  targetDomain: z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain like example.com").nullable(),
  locationCode: z.number().int().positive(), languageCode: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(1).max(64), competitorDomains: z.array(z.string().trim().toLowerCase().max(253)).max(20),
  audience: z.string().trim().max(2000).nullable(), brandVoice: z.string().trim().max(2000).nullable(),
  publishingMode: z.enum(["draft", "review", "auto_publish"]),
  thumbnailStyle: z.string().trim().max(1000).nullable(), inlineImageStyle: z.string().trim().max(1000).nullable(),
  articleUrlPrefix: z.string().trim().startsWith("/", "Start the article path with /").max(200),
  maxInlineImages: z.number().int().min(0).max(8), perRunBudgetUsd: z.number().min(0.001).max(100),
  dailyBudgetUsd: z.number().min(0.001).max(1000), monthlyBudgetUsd: z.number().min(0.001).max(10000),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.targetDomain) ctx.addIssue({ code: "custom", message: "Add your domain before enabling SEO research" });
  if (value.dailyBudgetUsd < value.perRunBudgetUsd) ctx.addIssue({ code: "custom", message: "Daily budget must be at least the per-run budget" });
  if (value.monthlyBudgetUsd < value.dailyBudgetUsd) ctx.addIssue({ code: "custom", message: "Monthly budget must be at least the daily budget" });
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); } catch { ctx.addIssue({ code: "custom", message: "Invalid timezone" }); }
});

async function requireOwner(blogId: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage SEO settings");
  const blog = await prisma.blog.findFirst({
    where: { id: blogId, userId: session.user.id },
    select: { id: true, userId: true, user: { select: { plan: true } } },
  });
  if (!blog) throw new ApiError(403, "Only the blog owner can manage SEO settings");
  return { ...blog, managed: isManagedPlan(blog.user.plan) };
}

export async function getSeoDashboardData(blogId: string) {
  const blog = await requireOwner(blogId);
  const [credentials, settings] = await Promise.all([
    blog.managed ? [] : prisma.seoProviderCredential.findMany({
      where: { ownerUserId: blog.userId, provider: "dataforseo", verifiedAt: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, loginHint: true },
    }),
    prisma.blogSeoSettings.findUnique({ where: { blogId } }),
  ]);
  return { plan: blog.managed ? "subscription" as const : "lifetime" as const, credentials, settings };
}

export async function saveBlogSeoSettings(blogId: string, input: unknown) {
  try {
    const blog = await requireOwner(blogId);
    const data = settingsSchema.parse(input);
    let credentialId: string | null = null;
    if (!blog.managed) {
      const credentials = await prisma.seoProviderCredential.findMany({
        where: { ownerUserId: blog.userId, provider: "dataforseo", verifiedAt: { not: null } },
        select: { id: true },
      });
      // With a single connection there is nothing to choose.
      credentialId = data.credentialId ?? (credentials.length === 1 ? credentials[0].id : null);
      if (credentialId && !credentials.some((item) => item.id === credentialId)) {
        throw new ApiError(403, "Choose a verified DataForSEO connection owned by your account");
      }
      if (data.enabled && !credentialId) throw new ApiError(400, "Connect DataForSEO in Settings → Providers first");
    }
    const micros = (value: number) => Math.round(value * 1_000_000);
    const values = {
      credentialId, enabled: data.enabled, targetDomain: data.targetDomain,
      locationCode: data.locationCode, languageCode: data.languageCode, timezone: data.timezone,
      competitorDomains: data.competitorDomains.filter(Boolean), audience: data.audience || null,
      brandVoice: data.brandVoice || null, publishingMode: data.publishingMode,
      thumbnailStyle: data.thumbnailStyle || null, inlineImageStyle: data.inlineImageStyle || null,
      articleUrlPrefix: `/${data.articleUrlPrefix.split("/").filter(Boolean).join("/")}`,
      maxInlineImages: data.maxInlineImages, perRunBudgetUsdMicros: micros(data.perRunBudgetUsd),
      dailyBudgetUsdMicros: micros(data.dailyBudgetUsd), monthlyBudgetUsdMicros: micros(data.monthlyBudgetUsd),
    };
    await prisma.blogSeoSettings.upsert({ where: { blogId }, create: { blogId, ...values }, update: values });
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}
