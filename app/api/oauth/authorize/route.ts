import { getSession } from "@/lib/get-session";
import {
  OAuthError,
  assertBlogsAccessible,
  createAuthorizationCode,
  isTrustedAuthorizationOrigin,
  validateAuthorizationRequest,
} from "@/lib/integrations/oauth";

function addParams(uri: string, values: Record<string, string | undefined>): URL {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(values)) if (value) url.searchParams.set(key, value);
  return url;
}

export async function POST(request: Request) {
  let safeRedirectUri: string | undefined;
  let state = "";
  try {
    if (Number(request.headers.get("content-length") || 0) > 32_768) {
      throw new OAuthError("invalid_request", "Request is too large", 413);
    }
    if (!isTrustedAuthorizationOrigin(request)) {
      throw new OAuthError("access_denied", "Cross-site authorization is not allowed", 403);
    }
    const form = await request.formData();
    const authorization = await validateAuthorizationRequest({
      clientId: String(form.get("client_id") || ""),
      redirectUri: String(form.get("redirect_uri") || ""),
      responseType: String(form.get("response_type") || ""),
      codeChallenge: String(form.get("code_challenge") || ""),
      codeChallengeMethod: String(form.get("code_challenge_method") || ""),
      resource: form.get("resource") ? String(form.get("resource")) : null,
      scope: form.get("scope") ? String(form.get("scope")) : null,
    });
    safeRedirectUri = authorization.redirectUri;
    state = String(form.get("state") || "");

    const session = await getSession();
    if (!session?.user?.id || !session.user.email) {
      throw new OAuthError("access_denied", "A signed-in session is required", 401);
    }

    if (String(form.get("decision")) !== "approve") {
      return Response.redirect(addParams(authorization.redirectUri, { error: "access_denied", state }).toString(), 303);
    }

    const blogIds = form.getAll("blog_ids").map(String);
    // Keep compatibility with consent pages opened before multi-blog support.
    if (blogIds.length === 0 && form.get("blog_id")) blogIds.push(String(form.get("blog_id")));
    await assertBlogsAccessible(session.user.id, session.user.email, blogIds);

    const code = await createAuthorizationCode({
      clientId: authorization.client.clientId,
      userId: session.user.id,
      blogIds,
      redirectUri: authorization.redirectUri,
      codeChallenge: String(form.get("code_challenge")),
      scopes: authorization.scopes,
      resource: authorization.resource,
    });
    return Response.redirect(addParams(authorization.redirectUri, { code, state }).toString(), 303);
  } catch (error) {
    const oauth = error instanceof OAuthError ? error : new OAuthError("server_error", "Authorization failed", 500);
    if (safeRedirectUri) {
      return Response.redirect(
        addParams(safeRedirectUri, { error: oauth.code, error_description: oauth.message, state }).toString(),
        303,
      );
    }
    return Response.json({ error: oauth.code, error_description: oauth.message }, { status: oauth.status, headers: { "Cache-Control": "no-store" } });
  }
}
