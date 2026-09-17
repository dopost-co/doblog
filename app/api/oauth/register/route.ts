import { OAuthError, registerPublicClient } from "@/lib/integrations/oauth";
import { rateLimited, clientIp } from "@/lib/integrations/oauth-rate-limit";

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (rateLimited(`oauth-register:${clientIp(request)}`)) {
      return json({ error: "invalid_request", error_description: "Too many requests" }, 429);
    }
    if (Number(request.headers.get("content-length") || 0) > 32_768) {
      return json({ error: "invalid_client_metadata", error_description: "Request is too large" }, 413);
    }
    const body = (await request.json()) as Record<string, unknown>;
    const client = await registerPublicClient({
      clientName: typeof body.client_name === "string" ? body.client_name : undefined,
      clientUri: typeof body.client_uri === "string" ? body.client_uri : undefined,
      logoUri: typeof body.logo_uri === "string" ? body.logo_uri : undefined,
      redirectUris: Array.isArray(body.redirect_uris)
        ? body.redirect_uris.filter((value): value is string => typeof value === "string")
        : [],
      grantTypes: Array.isArray(body.grant_types)
        ? body.grant_types.filter((value): value is string => typeof value === "string")
        : undefined,
      responseTypes: Array.isArray(body.response_types)
        ? body.response_types.filter((value): value is string => typeof value === "string")
        : undefined,
      tokenEndpointAuthMethod:
        typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : undefined,
    });
    return json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        client_name: client.clientName,
        client_uri: client.clientUri,
        logo_uri: client.logoUri,
        redirect_uris: client.redirectUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        token_endpoint_auth_method: "none",
      },
      201,
    );
  } catch (error) {
    const oauth = error instanceof OAuthError ? error : new OAuthError("invalid_client_metadata", "Invalid client metadata");
    return json({ error: oauth.code, error_description: oauth.message }, oauth.status);
  }
}
