import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { missingAutopilotStep } from "@/lib/autopilot/setup";
import { OnboardingFlow } from "@/components/Onboarding/OnboardingFlow";
import { blogOnboardingValues } from "@/src/server/services/onboarding/queries";

/** Finishing setup starts finding the first ideas in the background, within this request. */
export const maxDuration = 300;

export const metadata = { title: "Set up Autopilot" };

/** Autopilot questions for a blog created before onboarding asked them. */
export default async function AutopilotOnboardingPage({ searchParams }: { searchParams: Promise<{ blog?: string | string[] }> }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompleted: true } });
  if (!user) redirect("/api/auth/signout");
  if (!user.onboardingCompleted) redirect("/onboarding");

  const { blog: blogParam } = await searchParams;
  const blog = typeof blogParam === "string"
    ? await prisma.blog.findFirst({
        where: { id: blogParam, userId: session.user.id, deletedAt: null },
        select: { id: true, seoSettings: { select: { targetDomain: true, audience: true, brandVoice: true } } },
      })
    : null;
  if (!blog) redirect("/dashboard");

  const step = missingAutopilotStep(blog.seoSettings);
  if (!step) redirect(`/dashboard/blogs/${blog.id}/autopilot`);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <OnboardingFlow flow="autopilot-setup" initialStep={step} initialValues={await blogOnboardingValues(blog.id)} initialBlogId={blog.id} />
    </main>
  );
}
