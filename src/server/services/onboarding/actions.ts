"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { slugify } from "@/lib/slug";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { ONBOARDING_STEPS, stepIndex, type OnboardingStepId, type OnboardingValues } from "@/lib/onboarding/steps";

type Handler = (userId: string, values: OnboardingValues) => Promise<void>;

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : [value ?? ""]).map((item) => item.trim()).filter(Boolean);

/** What each step saves. Steps without an entry only advance. */
const STEP_HANDLERS: Partial<Record<OnboardingStepId, Handler>> = {
  profile: async (userId, values) => {
    await prisma.user.update({ where: { id: userId }, data: { name: single(values.name) } });
  },
  blogs: async (userId, values) => {
    const existing = await prisma.blog.findMany({ where: { userId }, select: { name: true, slug: true } });
    const slugs = new Set(existing.map((blog) => blog.slug));
    const names = new Set(existing.map((blog) => blog.name.toLowerCase()));
    for (const name of list(values.blogs)) {
      // Re-submitting a step must not duplicate blogs.
      if (names.has(name.toLowerCase())) continue;
      const base = slugify(name) || "blog";
      let slug = base;
      for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;
      await prisma.blog.create({ data: { userId, name, slug } });
      slugs.add(slug);
      names.add(name.toLowerCase());
    }
  },
};

function validate(stepId: string, values: OnboardingValues) {
  const step = ONBOARDING_STEPS.find((item) => item.id === stepId);
  if (!step) throw new ApiError(400, "Unknown onboarding step");
  for (const field of step.fields) {
    const entries = list(values[field.name]);
    if (field.required && entries.length === 0) throw new ApiError(400, `${field.label} is required`);
    const max = "maxLength" in field ? field.maxLength : undefined;
    if (max && entries.some((entry) => entry.length > max)) throw new ApiError(400, `${field.label} is too long`);
  }
  return step;
}

/**
 * Saves one step and records progress on the user (onboardingStep), or marks
 * onboarding as completed after the last step.
 */
export async function completeOnboardingStep(stepId: string, values: OnboardingValues) {
  try {
    const session = await getSession();
    if (!session?.user?.id) throw new ApiError(401, "Sign in to continue");
    const step = validate(stepId, values);
    await STEP_HANDLERS[step.id]?.(session.user.id, values);

    const next = ONBOARDING_STEPS[stepIndex(step.id) + 1];
    await prisma.user.update({
      where: { id: session.user.id },
      data: next ? { onboardingStep: next.id } : { onboardingStep: null, onboardingCompleted: true },
    });
    if (!next) revalidatePath("/dashboard", "layout");
    return { done: !next, nextStep: next?.id ?? null };
  } catch (error) { return { error: apiError(error).error }; }
}
