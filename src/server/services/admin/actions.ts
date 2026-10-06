"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { hashPassword } from "@/lib/auth";
import { PLANS } from "@/src/server/services/providers/credentials";
import { requireAdmin } from "./access";

const planChangeSchema = z.object({ userId: z.string().min(1), plan: z.enum(PLANS) }).strict();

/**
 * Moves an account between plans. Nothing is charged: it only decides whose
 * OpenAI and DataForSEO keys pay for the account's AI and SEO work from now on.
 */
export async function setUserPlan(input: unknown) {
  try {
    await requireAdmin();
    const { userId, plan } = planChangeSchema.parse(input);
    await prisma.user.update({ where: { id: userId }, data: { plan } });
    revalidatePath("/dashboard", "layout");
    return { success: true, plan };
  } catch (error) { return { error: apiError(error).error }; }
}

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  name: z.string().trim().max(80).optional(),
  // Empty means "make one up": it is shown once so it can be passed on.
  password: z.union([z.literal(""), z.string().min(8, "Use at least 8 characters").max(200)]).optional(),
  plan: z.enum(PLANS).default("lifetime"),
}).strict();

/** A password that is easy to read out and type: three groups of letters and digits. */
function readablePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(15);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10)}`;
}

/**
 * Creates an account with email and password for someone else. They sign in
 * with it, go through onboarding and can change the password from their menu.
 */
export async function createUserByAdmin(input: unknown) {
  try {
    await requireAdmin();
    const data = createUserSchema.parse(input);
    const existing = await prisma.user.findFirst({ where: { email: { equals: data.email, mode: "insensitive" } }, select: { id: true } });
    if (existing) throw new ApiError(409, "An account with this email already exists");
    const password = data.password || readablePassword();
    await prisma.user.create({ data: { email: data.email, name: data.name || null, password: await hashPassword(password), plan: data.plan } });
    revalidatePath("/dashboard/admin");
    return { email: data.email, password };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the details" };
    return { error: apiError(error).error };
  }
}
