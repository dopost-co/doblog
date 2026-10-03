import { redirect } from "next/navigation";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getCategoriesByBlogId } from "@/src/server/services/categories/queries";
import { CreateCategoryDialog } from "@/components/CreateCategoryDialog/CreateCategoryDialog";
import { CategoriesList } from "@/components/CategoriesList/CategoriesList";
import { SettingsSectionHeader } from "@/components/SettingsNav/SettingsNav";

export default async function BlogCategoriesPage({
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

  const categories = await getCategoriesByBlogId(id);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="Categories"
        action={access.can("content.write") ? <CreateCategoryDialog blogId={id} /> : undefined}
      />
      <CategoriesList categories={categories} blogId={id} canEdit={access.can("content.write")} />
    </div>
  );
}
