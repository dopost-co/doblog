import { BlogIntegrationLayout, integrationBlog } from "@/components/Integrations/BlogIntegrationLayout";
import { ApiKeysTable, CreateApiKeyDialog } from "@/components/Integrations/ApiKeysManager";
import { listApiKeys } from "@/src/server/services/api-keys/actions";

export default async function ApiKeysPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { blog, access } = await integrationBlog(id);
  const canManage = access.can("integrations.manage");
  const keys = canManage ? await listApiKeys(id) : [];
  return <BlogIntegrationLayout blog={blog} title="API keys" actions={canManage ? <CreateApiKeyDialog blogId={id} /> : undefined}>
    {canManage ? <ApiKeysTable blogId={id} keys={keys.map(key => ({ ...key, createdAt: key.createdAt.toISOString(), expiresAt: key.expiresAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null, lastUsedAt: key.lastUsedAt?.toISOString() ?? null }))} /> :
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Only blog admins can manage API keys. Ask an admin to create a scoped key for your client.</p>}
  </BlogIntegrationLayout>;
}
