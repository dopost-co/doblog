"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { verifyDataForSeoCredentials } from "./dataforseo";

const credentialSchema = z.object({
  label: z.string().trim().min(1).max(80),
  login: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(500),
}).strict();

const settingsSchema = z.object({
  credentialId: z.string().min(1).nullable(), enabled: z.boolean(),
  targetDomain: z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).nullable(),
  locationCode: z.number().int().positive(), languageCode: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(1).max(64), competitorDomains: z.array(z.string().trim().toLowerCase().max(253)).max(20),
  audience: z.string().trim().max(2000).nullable(), brandVoice: z.string().trim().max(2000).nullable(),
  publishingMode: z.enum(["draft", "review", "auto_publish"]), imageStyle: z.string().trim().max(1000).nullable(),
  imagesPerPost: z.number().int().min(0).max(5), perRunBudgetUsd: z.number().min(0.001).max(100),
  dailyBudgetUsd: z.number().min(0.001).max(1000), monthlyBudgetUsd: z.number().min(0.001).max(10000),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && (!value.credentialId || !value.targetDomain)) ctx.addIssue({ code: "custom", message: "A connection and target domain are required before enabling SEO" });
  if (value.dailyBudgetUsd < value.perRunBudgetUsd) ctx.addIssue({ code: "custom", message: "Daily budget must be at least the per-run budget" });
  if (value.monthlyBudgetUsd < value.dailyBudgetUsd) ctx.addIssue({ code: "custom", message: "Monthly budget must be at least the daily budget" });
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); } catch { ctx.addIssue({ code: "custom", message: "Invalid timezone" }); }
});

async function requireOwner(blogId: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage SEO settings");
  const blog = await prisma.blog.findFirst({ where: { id: blogId, userId: session.user.id }, select: { id: true, userId: true } });
  if (!blog) throw new ApiError(403, "Only the blog owner can manage SEO connections");
  return blog;
}

export async function getSeoDashboardData(blogId: string) {
  const blog = await requireOwner(blogId);
  const [credentials, settings] = await Promise.all([
    prisma.seoProviderCredential.findMany({ where: { ownerUserId: blog.userId, provider: "dataforseo" }, orderBy: { createdAt: "desc" }, select: { id: true, label: true, loginHint: true, verifiedAt: true } }),
    prisma.blogSeoSettings.findUnique({ where: { blogId } }),
  ]);
  return { credentials: credentials.map(item => ({ ...item, verifiedAt: item.verifiedAt?.toISOString() ?? null })), settings };
}

export async function createDataForSeoCredential(blogId: string, input: unknown) {
  try {
    const blog = await requireOwner(blogId);
    const data = credentialSchema.parse(input);
    await verifyDataForSeoCredentials({ login: data.login, password: data.password });
    const credential = await prisma.seoProviderCredential.create({ data: {
      ownerUserId: blog.userId, provider: "dataforseo", label: data.label,
      encryptedLogin: encryptSecret(data.login), encryptedPassword: encryptSecret(data.password),
      loginHint: data.login.length <= 5 ? "••••" : `${data.login.slice(0, 2)}•••${data.login.slice(-3)}`,
      verifiedAt: new Date(),
    }, select: { id: true, label: true, loginHint: true, verifiedAt: true } });
    revalidatePath(`/dashboard/blogs/${blogId}/seo`);
    return { credential: { ...credential, verifiedAt: credential.verifiedAt?.toISOString() ?? null } };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function saveBlogSeoSettings(blogId: string, input: unknown) {
  try {
    const blog = await requireOwner(blogId);
    const data = settingsSchema.parse(input);
    if (data.credentialId) {
      const credential = await prisma.seoProviderCredential.findFirst({ where: { id: data.credentialId, ownerUserId: blog.userId, provider: "dataforseo", verifiedAt: { not: null } }, select: { id: true } });
      if (!credential) throw new ApiError(403, "Choose a verified DataForSEO connection owned by your account");
    }
    const micros = (value: number) => Math.round(value * 1_000_000);
    const values = {
      credentialId: data.credentialId, enabled: data.enabled, targetDomain: data.targetDomain,
      locationCode: data.locationCode, languageCode: data.languageCode, timezone: data.timezone,
      competitorDomains: data.competitorDomains.filter(Boolean), audience: data.audience || null,
      brandVoice: data.brandVoice || null, publishingMode: data.publishingMode, imageStyle: data.imageStyle || null,
      imagesPerPost: data.imagesPerPost, perRunBudgetUsdMicros: micros(data.perRunBudgetUsd),
      dailyBudgetUsdMicros: micros(data.dailyBudgetUsd), monthlyBudgetUsdMicros: micros(data.monthlyBudgetUsd),
    };
    await prisma.blogSeoSettings.upsert({ where: { blogId }, create: { blogId, ...values }, update: values });
    revalidatePath(`/dashboard/blogs/${blogId}/seo`);
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}
