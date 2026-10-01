"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError } from "@/lib/integrations/errors";
import {
  addContentPlanItem,
  planItemInputSchema,
  removeContentPlanItem,
} from "./service";
import { discoverContentOpportunities, saveDiscoverySettings, setAutopilotActive } from "./discovery";
import { queueContentPlanDraft } from "./draft-queue";
import { previewImage } from "./image-preview";
import { countRefreshableCovers, queueCoverRefresh, type CoverRefreshScope } from "./cover-refresh";

/** Only the caller's choices; the cap stays a server decision. */
function pickCoverRefreshScope(scope: CoverRefreshScope): CoverRefreshScope {
  return { includeMissing: scope.includeMissing === true, includeManual: scope.includeManual === true };
}

async function requireOwner(blogId: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage the content plan");
  const blog = await prisma.blog.findFirst({ where: { id: blogId, userId: session.user.id, deletedAt: null }, select: { id: true } });
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

/** Queues writing; the Ideas list shows the progress until the draft is ready. */
export async function generatePlanItemAction(blogId: string, itemId: string) {
  try {
    await requireOwner(blogId);
    await queueContentPlanDraft(blogId, itemId, "dashboard");
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function saveDiscoverySettingsAction(blogId: string, input: unknown, runNow = false) {
  try {
    await requireOwner(blogId);
    await saveDiscoverySettings(blogId, input, { activate: false });
    const discovery = runNow ? await discoverContentOpportunities(blogId, "dashboard") : null;
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true, discovery };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function setAutopilotActiveAction(blogId: string, active: boolean) {
  try {
    await requireOwner(blogId);
    const result = await setAutopilotActive(blogId, active);
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true, active: result.active, nextDiscoveryAt: result.nextDiscoveryAt?.toISOString() ?? null };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

/** A sample image with the settings on screen and an existing article; nothing is saved. */
export async function previewImageAction(blogId: string, input: unknown) {
  try {
    await requireOwner(blogId);
    return { success: true as const, ...await previewImage(blogId, input) };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

/** How many covers a refresh would redraw, so the confirmation can name a number. */
export async function countRefreshableCoversAction(blogId: string, scope: CoverRefreshScope = {}) {
  try {
    await requireOwner(blogId);
    return { success: true as const, count: await countRefreshableCovers(blogId, pickCoverRefreshScope(scope)) };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

/**
 * Redraws every cover this blog generated with the saved thumbnail settings.
 * Queued one article at a time, so the request returns at once.
 */
export async function refreshCoversAction(blogId: string, scope: CoverRefreshScope = {}) {
  try {
    await requireOwner(blogId);
    const result = await queueCoverRefresh(blogId, pickCoverRefreshScope(scope));
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true as const, ...result };
  } catch (error) {
    return { error: apiError(error).error };
  }
}
