import { redirect } from "next/navigation";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getBlogMembers } from "@/src/server/services/blogs/members/queries";
import { BlogMembers } from "@/components/BlogMembers/BlogMembers";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getBlogAccess(id);
  if (!access) redirect("/dashboard");
  const membersResult = await getBlogMembers(id);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title="Members" description="People who can open this blog, and what their role lets them do." />
      <BlogMembers
        blogId={id}
        members={membersResult.members || []}
        ownerEmail={membersResult.ownerEmail || ""}
        ownerUser={membersResult.ownerUser || null}
        canManage={access.can("members.manage")}
        currentEmail={access.email}
      />
    </div>
  );
}
