import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { stepIndex } from "@/lib/onboarding/steps";
import { OnboardingFlow } from "@/components/Onboarding/OnboardingFlow";
import { blogOnboardingValues, resolveUserFlow } from "@/src/server/services/onboarding/queries";

export const metadata = { title: "Welcome" };

/** First-run onboarding: new-user or invited-user, depending on the account. */
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      onboardingCompleted: true,
      onboardingStep: true,
      blogs: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true } },
    },
  });
  if (!user) redirect("/api/auth/signout");
  if (user.onboardingCompleted) redirect("/dashboard");

  const flow = await resolveUserFlow(session.user.id, session.user.email);
  const blog = flow === "new-user" ? user.blogs[0] : undefined;
  // Autopilot steps need a blog: without one, resume at the step that creates it.
  const initialStep = flow === "new-user" && !blog && stepIndex(flow, user.onboardingStep) > stepIndex(flow, "blogs")
    ? "blogs"
    : user.onboardingStep;
  const initialValues = {
    ...(user.name ? { name: user.name } : {}),
    ...(blog ? await blogOnboardingValues(blog.id) : {}),
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <OnboardingFlow flow={flow} initialStep={initialStep} initialValues={initialValues} initialBlogId={blog?.id ?? null} />
    </main>
  );
}
