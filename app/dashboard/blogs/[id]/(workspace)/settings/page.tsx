import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { userHasAccessToBlog } from "@/src/server/services/blogs/members/mutations";
import { BlogIdDisplay } from "@/components/BlogIdDisplay/BlogIdDisplay";
import { ImportPostsDialog } from "@/components/ImportPostsDialog/ImportPostsDialog";
import { BlogNameSettings } from "@/components/BlogNameSettings/BlogNameSettings";
import { BlogLanguagesSettings } from "@/components/BlogLanguages/BlogLanguagesSettings";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";
import { Label } from "@/components/ui/label";
import { DeleteBlog } from "@/components/DeleteBlog/DeleteBlog";

export default async function BlogSettingsPage({
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

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title="General" />
      <BlogNameSettings blogId={id} initialName={blog.name} canEdit={isOwner} />
      <BlogLanguagesSettings
        blogId={id}
        initialLanguages={blog.languages}
        initialAutoSync={blog.autoSyncTranslations}
        canEdit={isOwner}
      />
      <BlogIdDisplay blogId={blog.blogId} />
      <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <Label>Import posts</Label>
          <p className="text-sm text-muted-foreground">
            Markdown files with frontmatter.
          </p>
        </div>
        <ImportPostsDialog blogId={id} />
      </div>
      {isOwner && <DeleteBlog blogId={id} blogName={blog.name} />}
    </div>
  );
}
