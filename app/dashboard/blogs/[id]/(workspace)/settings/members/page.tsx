import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { userHasAccessToBlog } from "@/src/server/services/blogs/members/mutations";
import { getBlogMembers } from "@/src/server/services/blogs/members/queries";
import { BlogMembers } from "@/components/BlogMembers/BlogMembers";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogMembersPage({
  params,
}: {
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

  const isOwner = blog.userId === session?.user?.id;
  const membersResult = await getBlogMembers(id);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title="Members" />
      <BlogMembers
        blogId={id}
        members={membersResult.members || []}
        ownerEmail={membersResult.ownerEmail || ""}
        ownerUser={membersResult.ownerUser || null}
        isOwner={isOwner}
      />
    </div>
  );
}
