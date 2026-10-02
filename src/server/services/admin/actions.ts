"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/integrations/errors";
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
