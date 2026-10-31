import { GET as metadata } from "../route";

export const dynamic = "force-dynamic";

// RFC 9728 §3.1: clients may look up metadata with the resource path appended
// (/.well-known/oauth-protected-resource/api/mcp). The gateway serves /mcp.
const RESOURCE_PATHS = new Set(["api/mcp", "mcp"]);

export async function GET(_request: Request, { params }: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await params;
  if (!RESOURCE_PATHS.has(resource.join("/"))) return Response.json({ error: "Not found" }, { status: 404 });
  return metadata();
}
