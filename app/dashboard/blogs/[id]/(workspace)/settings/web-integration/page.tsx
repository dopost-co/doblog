import { redirect } from "next/navigation";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";
import { WebsiteDashboard } from "@/components/Website/WebsiteDashboard";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getWebsiteState } from "@/src/server/services/publishing/queries";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Web integration" };

export default async function WebIntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getBlogAccess(id);
  const blog = access ? await prisma.blog.findFirst({ where: { id, deletedAt: null }, select: { id: true } }) : null;
  if (!access || !blog) redirect("/dashboard");
  const state = await getWebsiteState(blog.id);
  return (
    <div className="space-y-2">
      <SettingsSectionHeader title="Web integration" description="Where your published articles appear." />
      <WebsiteDashboard state={state} canManage={access.can("integrations.manage")} canWrite={access.can("content.write")} />
    </div>
  );
}
