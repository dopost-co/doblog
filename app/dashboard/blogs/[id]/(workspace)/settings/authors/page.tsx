import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { userHasAccessToBlog } from "@/src/server/services/blogs/members/mutations";
import { getAuthorsByBlogId } from "@/src/server/services/authors/queries";
import { CreateAuthorDialog } from "@/components/CreateAuthorDialog/CreateAuthorDialog";
import { AuthorsList } from "@/components/AuthorsList/AuthorsList";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogAuthorsPage({
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

  const authors = await getAuthorsByBlogId(id);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="Authors"
        action={<CreateAuthorDialog blogId={id} />}
      />
      <AuthorsList authors={authors} blogId={id} />
    </div>
  );
}
