import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { getBlogAccess } from "@/src/server/services/blogs/access";

export async function integrationBlog(id: string) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/");
  const access = await getBlogAccess(id);
  const blog = access ? await prisma.blog.findFirst({ where: { id, deletedAt: null } }) : null;
  if (!access || !blog) redirect("/dashboard");
  return { blog, access };
}

export function BlogIntegrationLayout({ title, description, actions, children }: {
  blog: { id: string; name: string }; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return <div className="mx-auto w-full max-w-5xl space-y-6">
    <PageHeader title={title} description={description} actions={actions} />
    <div className="space-y-8">{children}</div>
  </div>;
}
