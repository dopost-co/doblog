"use server";

import OpenAI from "openai";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { encryptSecret } from "@/lib/crypto/secrets";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { verifyDataForSeoCredentials } from "@/src/server/services/seo/dataforseo";
import { isManagedPlan } from "./credentials";

const openAiKeySchema = z.string().trim().min(20, "That doesn't look like an OpenAI API key").max(300);
const dataForSeoSchema = z.object({
  label: z.string().trim().min(1).max(80),
  login: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(500),
}).strict();

const hint = (value: string) => value.length <= 8 ? "••••" : `${value.slice(0, 3)}…${value.slice(-4)}`;

async function requireUser() {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage providers");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, plan: true } });
  if (!user) throw new ApiError(401, "Sign in to manage providers");
  if (isManagedPlan(user.plan)) throw new ApiError(409, "Providers are included in your plan");
  return user;
}

/** Provider settings of the signed-in account. Keys are account-wide and shared by all its blogs. */
export async function getProviderSettings() {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage providers");
  const [user, credentials] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { plan: true, openaiKeyHint: true } }),
    prisma.seoProviderCredential.findMany({
      where: { ownerUserId: session.user.id, provider: "dataforseo" },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, loginHint: true, verifiedAt: true },
    }),
  ]);
  return {
    plan: isManagedPlan(user.plan) ? "subscription" as const : "lifetime" as const,
    openai: { hint: user.openaiKeyHint },
    dataForSeo: credentials.map((item) => ({ ...item, verifiedAt: item.verifiedAt?.toISOString() ?? null })),
  };
}

export async function saveOpenAiKey(input: unknown) {
  try {
    const user = await requireUser();
    const key = openAiKeySchema.parse(input);
    try {
      await new OpenAI({ apiKey: key, timeout: 15_000, maxRetries: 0 }).models.list();
    } catch {
      throw new ApiError(400, "OpenAI rejected this key. Check it and try again.");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { openaiApiKeyEncrypted: encryptSecret(key), openaiKeyHint: hint(key) },
    });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function removeOpenAiKey() {
  try {
    const user = await requireUser();
    await prisma.user.update({ where: { id: user.id }, data: { openaiApiKeyEncrypted: null, openaiKeyHint: null } });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function addDataForSeoConnection(input: unknown) {
  try {
    const user = await requireUser();
    const data = dataForSeoSchema.parse(input);
    await verifyDataForSeoCredentials({ login: data.login, password: data.password });
    await prisma.seoProviderCredential.create({ data: {
      ownerUserId: user.id, provider: "dataforseo", label: data.label,
      encryptedLogin: encryptSecret(data.login), encryptedPassword: encryptSecret(data.password),
      loginHint: data.login.length <= 5 ? "••••" : `${data.login.slice(0, 2)}•••${data.login.slice(-3)}`,
      verifiedAt: new Date(),
    } });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}
