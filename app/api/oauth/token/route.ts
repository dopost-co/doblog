import { OAuthError, exchangeAuthorizationCode, exchangeRefreshToken } from "@/lib/integrations/oauth";
import { rateLimited, clientIp } from "@/lib/integrations/oauth-rate-limit";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

function oauthError(error: unknown) {
  const oauth = error instanceof OAuthError ? error : new OAuthError("server_error", "Unable to issue token", 500);
  return json({ error: oauth.code, error_description: oauth.message }, oauth.status);
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 32_768) {
      throw new OAuthError("invalid_request", "Request is too large", 413);
    }
    const form = await request.formData();
    const grantType = String(form.get("grant_type") || "");
    const clientId = String(form.get("client_id") || "");
    const resource = form.get("resource") ? String(form.get("resource")) : null;
    if (!clientId) throw new OAuthError("invalid_client", "client_id is required", 401);
    if (rateLimited(`oauth-token:${clientId}:${clientIp(request)}`)) {
      throw new OAuthError("invalid_request", "Too many requests", 429);
    }

    const tokens =
      grantType === "authorization_code"
        ? await exchangeAuthorizationCode({
            code: String(form.get("code") || ""),
            clientId,
            redirectUri: String(form.get("redirect_uri") || ""),
            codeVerifier: String(form.get("code_verifier") || ""),
            resource,
          })
        : grantType === "refresh_token"
          ? await exchangeRefreshToken({
              refreshToken: String(form.get("refresh_token") || ""),
              clientId,
              resource,
            })
          : (() => {
              throw new OAuthError("unsupported_grant_type", "Unsupported grant_type");
            })();

    return json({
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
    });
  } catch (error) {
    return oauthError(error);
  }
}
