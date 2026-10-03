import { redirect } from "next/navigation";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getAuthorsByBlogId } from "@/src/server/services/authors/queries";
import { CreateAuthorDialog } from "@/components/CreateAuthorDialog/CreateAuthorDialog";
import { AuthorsList } from "@/components/AuthorsList/AuthorsList";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogAuthorsPage({
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

  const authors = await getAuthorsByBlogId(id);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="Authors"
        action={access.can("content.write") ? <CreateAuthorDialog blogId={id} /> : undefined}
      />
      <AuthorsList authors={authors} blogId={id} canEdit={access.can("content.write")} />
    </div>
  );
}
