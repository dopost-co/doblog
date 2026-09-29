import { BlogIntegrationLayout, integrationBlog } from "@/components/Integrations/BlogIntegrationLayout";
import { McpGuide } from "@/components/Integrations/McpGuide";
import { McpConnectionsManager } from "@/components/Integrations/McpConnectionsManager";
import { listMcpConnections } from "@/src/server/services/mcp-connections/actions";

export default async function McpPage({ params }: { params: Promise<{ id: string }> }) {
  const { blog } = await integrationBlog((await params).id);
  const connections = await listMcpConnections(blog.id);
  return <BlogIntegrationLayout blog={blog} title="MCP">
    <McpGuide dashboardId={blog.id} />
    <McpConnectionsManager blogId={blog.id} connections={connections} />
  </BlogIntegrationLayout>;
}
