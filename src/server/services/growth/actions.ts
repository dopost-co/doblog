"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError } from "@/lib/integrations/errors";
import {
  addContentPlanItem,
  generateContentPlanDraft,
  planItemInputSchema,
  removeContentPlanItem,
} from "./service";
import { discoverContentOpportunities, saveDiscoverySettings } from "./discovery";

async function requireOwner(blogId: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage the content plan");
  const blog = await prisma.blog.findFirst({ where: { id: blogId, userId: session.user.id }, select: { id: true } });
  if (!blog) throw new ApiError(403, "Only the blog owner can run AI generation");
  return blog;
}

export async function addPlanItemAction(blogId: string, input: unknown) {
  try {
    await requireOwner(blogId);
    const item = await addContentPlanItem(blogId, planItemInputSchema.parse(input));
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true, itemId: item.id };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function removePlanItemAction(blogId: string, itemId: string) {
  try {
    await requireOwner(blogId);
    await removeContentPlanItem(blogId, itemId);
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function generatePlanItemAction(blogId: string, itemId: string) {
  try {
    await requireOwner(blogId);
    const result = await generateContentPlanDraft(blogId, itemId, "dashboard");
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    revalidatePath(`/dashboard/blogs/${blogId}`);
    return { success: true, ...result };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function saveDiscoverySettingsAction(blogId: string, input: unknown, runNow = false) {
  try {
    await requireOwner(blogId);
    await saveDiscoverySettings(blogId, input);
    const discovery = runNow ? await discoverContentOpportunities(blogId, "dashboard") : null;
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true, discovery };
  } catch (error) {
    return { error: apiError(error).error };
  }
}
