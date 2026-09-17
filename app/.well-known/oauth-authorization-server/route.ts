import { API_SCOPES } from "@/lib/integrations/scopes";
import { oauthIssuer } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

export function GET() {
  const issuer = oauthIssuer();
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      revocation_endpoint: `${issuer}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      resource_indicators_supported: true,
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
      scopes_supported: API_SCOPES,
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
