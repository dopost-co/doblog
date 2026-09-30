import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { OnboardingFlow } from "@/components/Onboarding/OnboardingFlow";
import { blogOnboardingValues } from "@/src/server/services/onboarding/queries";

export const metadata = { title: "New blog" };

/** Sets up another blog. `?blog=` resumes a blog this flow already created. */
export default async function NewBlogOnboardingPage({ searchParams }: { searchParams: Promise<{ blog?: string | string[] }> }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardingCompleted: true } });
  if (!user) redirect("/api/auth/signout");
  if (!user.onboardingCompleted) redirect("/onboarding");

  const { blog: blogParam } = await searchParams;
  const blogId = typeof blogParam === "string" ? blogParam : null;
  const blog = blogId ? await prisma.blog.findFirst({ where: { id: blogId, userId: session.user.id, deletedAt: null }, select: { id: true } }) : null;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <OnboardingFlow
        flow="new-blog"
        initialStep={blog ? "blog-languages" : null}
        initialValues={blog ? await blogOnboardingValues(blog.id) : {}}
        initialBlogId={blog?.id ?? null}
      />
    </main>
  );
}
