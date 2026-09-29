import { redirect } from "next/navigation";

export default async function LegacyAuthorsPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/dashboard/blogs/${(await params).id}/settings/authors`);
}
