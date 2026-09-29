import { BlogIntegrationLayout, integrationBlog } from "@/components/Integrations/BlogIntegrationLayout";
import { SeoSettingsManager } from "@/components/Seo/SeoSettingsManager";
import { getSeoDashboardData } from "@/src/server/services/seo/actions";

export default async function SeoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { blog, isOwner } = await integrationBlog(id);
  const data = isOwner ? await getSeoDashboardData(id) : null;
  return <BlogIntegrationLayout blog={blog} title="Growth">
    {data ? <SeoSettingsManager blogId={id} initialCredentials={data.credentials} settings={data.settings} /> :
      <p className="rounded-xl border p-6 text-sm text-muted-foreground">Only the blog owner can configure paid SEO providers. Members can continue reviewing and editing generated drafts.</p>}
  </BlogIntegrationLayout>;
}
