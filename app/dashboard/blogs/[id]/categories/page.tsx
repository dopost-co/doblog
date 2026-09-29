import { redirect } from "next/navigation";

export default async function LegacyCategoriesPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/dashboard/blogs/${(await params).id}/settings/categories`);
}
