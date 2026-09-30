import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secrets";
import { ApiError } from "@/lib/integrations/errors";

/**
 * lifetime: a one-time purchase. The user brings their own AI and DataForSEO
 * keys, so every provider call is billed to them.
 * subscription: the platform's own keys are used and the user never sees them.
 */
export const PLANS = ["lifetime", "subscription"] as const;
export type Plan = typeof PLANS[number];

export const isManagedPlan = (plan: string | null | undefined) => plan === "subscription";

export async function getUserPlan(userId: string): Promise<Plan> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return isManagedPlan(user?.plan) ? "subscription" : "lifetime";
}

/** The AI key used for work on a blog: always the blog owner's (or the platform's for subscribers). */
export async function resolveOpenAiKey(ownerUserId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: ownerUserId },
    select: { plan: true, openaiApiKeyEncrypted: true },
  });
  if (!user) throw new ApiError(404, "Blog owner not found");
  if (isManagedPlan(user.plan)) {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new ApiError(503, "AI features are temporarily unavailable");
    return key;
  }
  if (!user.openaiApiKeyEncrypted) {
    throw new ApiError(412, "Add an OpenAI API key in Settings → Providers to use AI features");
  }
  return decryptSecret(user.openaiApiKeyEncrypted);
}

export async function resolveBlogOpenAiKey(blogId: string): Promise<string> {
  const blog = await prisma.blog.findUnique({ where: { id: blogId, deletedAt: null }, select: { userId: true } });
  if (!blog) throw new ApiError(404, "Blog not found");
  return resolveOpenAiKey(blog.userId);
}

export type DataForSeoAccess = { credentialId: string | null; login: string; password: string; cacheScope: string };

/**
 * DataForSEO access for a blog. Subscribers use the platform account; lifetime
 * users use the verified connection selected in the blog's SEO settings.
 */
export async function resolveDataForSeoAccess(blogId: string): Promise<DataForSeoAccess> {
  const blog = await prisma.blog.findUnique({
    where: { id: blogId, deletedAt: null },
    select: { user: { select: { plan: true } }, seoSettings: { include: { credential: true } } },
  });
  if (!blog) throw new ApiError(404, "Blog not found");
  if (isManagedPlan(blog.user.plan)) {
    const login = process.env.DATAFORSEO_LOGIN?.trim();
    const password = process.env.DATAFORSEO_PASSWORD?.trim();
    if (!login || !password) throw new ApiError(503, "SEO research is temporarily unavailable");
    return { credentialId: null, login, password, cacheScope: "platform" };
  }
  const credential = blog.seoSettings?.credential;
  if (!credential) throw new ApiError(409, "Connect DataForSEO in Settings → Providers to use SEO research");
  if (!credential.verifiedAt) throw new ApiError(409, "The DataForSEO connection has not been verified");
  return {
    credentialId: credential.id,
    login: decryptSecret(credential.encryptedLogin),
    password: decryptSecret(credential.encryptedPassword),
    cacheScope: credential.id,
  };
}
