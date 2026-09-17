import { API_SCOPES } from "@/lib/integrations/scopes";
import { oauthIssuer, oauthResource } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      resource: oauthResource(),
      resource_name: "zenex-cms MCP",
      authorization_servers: [oauthIssuer()],
      bearer_methods_supported: ["header"],
      scopes_supported: API_SCOPES,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
