"use server";

import { revalidatePath } from "next/cache";
import { apiError } from "@/lib/integrations/errors";
import { requireBlogPermission } from "@/src/server/services/blogs/access";
import {
  addContentPlanItem,
  planItemInputSchema,
  removeContentPlanItem,
} from "./service";
import { discoverContentOpportunities, saveDiscoverySettings, setAutopilotActive, startContentDiscovery } from "./discovery";
import { queueContentPlanDraft } from "./draft-queue";
import { previewImage } from "./image-preview";
import { countRefreshableCovers, queueCoverRefresh, refreshPostCover, type CoverRefreshScope } from "./cover-refresh";

/** Only the caller's choices; the cap stays a server decision. */
function pickCoverRefreshScope(scope: CoverRefreshScope): CoverRefreshScope {
  return { includeMissing: scope.includeMissing === true, includeManual: scope.includeManual === true };
}


export async function addPlanItemAction(blogId: string, input: unknown) {
  try {
    await requireBlogPermission(blogId, "autopilot.write");
    const item = await addContentPlanItem(blogId, planItemInputSchema.parse(input));
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true, itemId: item.id };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function removePlanItemAction(blogId: string, itemId: string) {
  try {
    await requireBlogPermission(blogId, "autopilot.write");
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
    await requireBlogPermission(blogId, "autopilot.write");
    await queueContentPlanDraft(blogId, itemId, "dashboard");
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

export async function saveDiscoverySettingsAction(blogId: string, input: unknown, runNow = false) {
  try {
    await requireBlogPermission(blogId, "autopilot.manage");
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
    await requireBlogPermission(blogId, "autopilot.manage");
    const result = await setAutopilotActive(blogId, active);
    // Find ideas right away instead of waiting up to an hour for the scheduled sweep.
    const discovery = active ? await startContentDiscovery(blogId, "activation") : null;
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true, active: result.active, nextDiscoveryAt: result.nextDiscoveryAt?.toISOString() ?? null, discovering: Boolean(discovery) };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

/** A sample image with the settings on screen and an existing article; nothing is saved. */
export async function previewImageAction(blogId: string, input: unknown) {
  try {
    await requireBlogPermission(blogId, "autopilot.manage");
    return { success: true as const, ...await previewImage(blogId, input) };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

/** How many covers a refresh would redraw, so the confirmation can name a number. */
export async function countRefreshableCoversAction(blogId: string, scope: CoverRefreshScope = {}) {
  try {
    await requireBlogPermission(blogId, "autopilot.manage");
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
    await requireBlogPermission(blogId, "autopilot.manage");
    const result = await queueCoverRefresh(blogId, pickCoverRefreshScope(scope));
    revalidatePath(`/dashboard/blogs/${blogId}/autopilot`);
    return { success: true as const, ...result };
  } catch (error) {
    return { error: apiError(error).error };
  }
}

/**
 * Draws one article's cover now with the saved thumbnail settings, replacing
 * whatever cover it had. Waits for the image, so the caller can show it.
 */
export async function regeneratePostCoverAction(blogId: string, postId: string) {
  try {
    await requireBlogPermission(blogId, "autopilot.write");
    const result = await refreshPostCover(blogId, postId);
    revalidatePath(`/dashboard/blogs/${blogId}`);
    return { success: true as const, ...result };
  } catch (error) {
    return { error: apiError(error).error };
  }
}
