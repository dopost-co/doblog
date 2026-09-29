import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogById, getBlogsByUserId } from "@/src/server/services/blogs/queries";
import { userHasAccessToBlog } from "@/src/server/services/blogs/members/mutations";
import { AppSidebar } from "@/components/AppSidebar/AppSidebar";
import { SIDEBAR_COOKIE, SidebarProvider } from "@/components/AppSidebar/SidebarProvider";
import { SiteHeader } from "@/components/AppSidebar/SiteHeader";

export default async function BlogWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  const { id } = await params;
  const blog = await getBlogById(id);

  if (!blog) {
    redirect("/dashboard");
  }

  const hasAccess = await userHasAccessToBlog(
    session?.user?.id || "",
    session?.user?.email || "",
    id
  );

  if (!hasAccess) {
    redirect("/dashboard");
  }

  const [blogs, cookieStore] = await Promise.all([
    getBlogsByUserId(session?.user?.id || "", session?.user?.email),
    cookies(),
  ]);
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        blog={{ id: blog.id, name: blog.name }}
        blogs={blogs.map(({ id, name }) => ({ id, name }))}
        user={{ name: session?.user?.name, email: session?.user?.email }}
      />
      <div className="flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-linear md:p-2 md:pl-64 md:group-data-[sidebar-open=false]/shell:pl-2">
        <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground md:h-[calc(100svh-1rem)] md:rounded-xl md:border md:border-border/80 md:shadow-xs md:dark:shadow-none">
          <SiteHeader blogId={blog.id} blogName={blog.name} />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
