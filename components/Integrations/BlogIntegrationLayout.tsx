import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader/PageHeader";

export async function integrationBlog(id: string) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const email = session.user.email?.trim().toLowerCase();
  const blog = await prisma.blog.findFirst({ where: { id, OR: [
    { userId: session.user.id }, ...(email ? [{ members: { some: { userEmail: email } } }] : []),
  ] } });
  if (!blog) redirect("/dashboard");
  return { blog, isOwner: blog.userId === session.user.id };
}

export function BlogIntegrationLayout({ title, description, children }: {
  blog: { id: string; name: string }; title: string; description: string; children: React.ReactNode;
}) {
  return <div className="mx-auto w-full max-w-5xl space-y-8">
    <PageHeader title={title} description={description} />
    <div className="space-y-8">{children}</div>
  </div>;
}
