import { redirect } from "next/navigation";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getBlogAccess } from "@/src/server/services/blogs/access";
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
  const { id } = await params;
  const blog = await getBlogById(id);

  if (!blog) {
    redirect("/dashboard");
  }

  const access = await getBlogAccess(id);

  if (!access) {
    redirect("/dashboard");
  }

  const canManage = access.can("blog.manage");

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title="General" />
      <BlogNameSettings blogId={id} initialName={blog.name} canEdit={canManage} />
      <BlogLanguagesSettings
        blogId={id}
        initialLanguages={blog.languages}
        initialAutoSync={blog.autoSyncTranslations}
        canEdit={canManage}
      />
      <BlogIdDisplay blogId={blog.blogId} />
      {access.can("content.write") && (
        <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Label>Import posts</Label>
            <p className="text-sm text-muted-foreground">
              Markdown files with frontmatter.
            </p>
          </div>
          <ImportPostsDialog blogId={id} />
        </div>
      )}
      {access.can("blog.delete") && <DeleteBlog blogId={id} blogName={blog.name} />}
    </div>
  );
}
