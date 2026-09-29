import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { OnboardingFlow } from "@/components/Onboarding/OnboardingFlow";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, onboardingCompleted: true, onboardingStep: true },
  });
  if (!user) redirect("/");
  if (user.onboardingCompleted) redirect("/dashboard");

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <OnboardingFlow initialStep={user.onboardingStep} initialValues={user.name ? { name: user.name } : {}} />
    </main>
  );
}
