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
  // The session points to a user this database does not have (e.g. deleted, or
  // signed in against another database): sign out instead of rendering a broken dashboard.
  if (!user) {
    redirect("/api/auth/signout");
  }
  if (!user.onboardingCompleted) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
