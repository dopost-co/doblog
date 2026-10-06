import { redirect } from "next/navigation";

/** The page moved to Settings → Web integration; old links still land there. */
export default async function WebsitePage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/dashboard/blogs/${(await params).id}/settings/web-integration`);
}
