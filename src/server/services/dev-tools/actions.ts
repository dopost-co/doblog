"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";

/** Dev tools act on the signed-in user only, and never outside local development. */
async function requireDevUser() {
  if (process.env.NODE_ENV !== "development") throw new Error("Dev tools are only available in development");
  const session = await getSession();
  if (!session?.user?.id) throw new Error("Sign in to use dev tools");
  return session.user.id;
}

export async function getOnboardingState() {
  const userId = await requireDevUser().catch(() => null);
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId }, select: { onboardingCompleted: true, onboardingStep: true } });
}

/** Sends the user back into onboarding at a given step, or marks it as completed. */
export async function setOnboardingState(input: { completed: boolean; step?: string | null }) {
  const userId = await requireDevUser();
  const step = input.step && ONBOARDING_STEPS.some((item) => item.id === input.step) ? input.step : null;
  await prisma.user.update({
    where: { id: userId },
    data: input.completed ? { onboardingCompleted: true, onboardingStep: null } : { onboardingCompleted: false, onboardingStep: step },
  });
  revalidatePath("/", "layout");
  return { completed: input.completed, step: input.completed ? null : step };
}
