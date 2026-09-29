import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompleted: true } });
  if (user && !user.onboardingCompleted) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
