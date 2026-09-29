import { redirect } from "next/navigation";
import { getSession } from "@/lib/get-session";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { userHasAccessToBlog } from "@/src/server/services/blogs/members/mutations";
import { getCategoriesByBlogId } from "@/src/server/services/categories/queries";
import { CreateCategoryDialog } from "@/components/CreateCategoryDialog/CreateCategoryDialog";
import { CategoriesList } from "@/components/CategoriesList/CategoriesList";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogCategoriesPage({
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

  const categories = await getCategoriesByBlogId(id);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="Categories"
        description="Group posts by topic. Categories are exposed through the public API."
        action={<CreateCategoryDialog blogId={id} />}
      />
      <CategoriesList categories={categories} blogId={id} />
    </div>
  );
}
