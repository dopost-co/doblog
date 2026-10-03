import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { API_SCOPES, type ApiScope } from "./scopes";
import type { ApiPrincipal } from "./auth";
import { can, isBlogRole, roleApiScopes, type BlogAccessRole, type BlogRole } from "@/lib/permissions";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

// Computed lazily (not at module load) so a missing env var only breaks the
// OAuth routes that need it, not every import of this module.
export function oauthIssuer(): string {
  const raw = (process.env.MCP_OAUTH_ISSUER || process.env.NEXTAUTH_URL)?.trim();
  if (!raw) throw new Error("NEXTAUTH_URL is required for MCP OAuth");
  return raw.replace(/\/+$/, "");
}

export function oauthResource(): string {
  return `${oauthIssuer()}/api/mcp`;
}

export function isTrustedAuthorizationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const submittedOrigin = new URL(origin).origin;
    return (
      submittedOrigin === new URL(request.url).origin ||
      submittedOrigin === new URL(oauthIssuer()).origin
    );
  } catch {
    return false;
  }
}

// Lets a standalone gateway (a different public hostname in front of the
// same /api/mcp) be accepted as the same protected resource.
function acceptedResources(): Set<string> {
  const extra = process.env.MCP_OAUTH_EXTRA_RESOURCES?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  return new Set([oauthResource(), ...extra]);
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomSecret(prefix: string): string {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

function expiresIn(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function parseScopes(value: string | null | undefined): ApiScope[] {
  if (!value?.trim()) return ["content:read", "content:write", "media:write", "seo:write"];
  const scopes = [...new Set(value.trim().split(/\s+/))];
  const invalid = scopes.filter((scope): scope is string => !API_SCOPES.includes(scope as ApiScope));
  if (invalid.length > 0) throw new OAuthError("invalid_scope", `Unknown scope: ${invalid.join(", ")}`);
  return scopes as ApiScope[];
}

export function assertCanonicalResource(resource: string | null | undefined): string {
  if (!resource || !acceptedResources().has(resource)) {
    throw new OAuthError("invalid_target", `resource must be ${oauthResource()}`);
  }
  return resource;
}

export function validateRedirectUri(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OAuthError("invalid_redirect_uri", "redirect_uri must be an absolute URL");
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (url.hash || url.username || url.password || (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uri must use HTTPS, except for HTTP loopback addresses");
  }
  return url.toString();
}

// Native clients bind an ephemeral loopback port per attempt (RFC 8252):
// the registered URI must match except for that port.
export function redirectUriMatchesRegistration(registeredRaw: string, requestedRaw: string): boolean {
  const registered = validateRedirectUri(registeredRaw);
  const requested = validateRedirectUri(requestedRaw);
  if (registered === requested) return true;
  const registeredUrl = new URL(registered);
  const requestedUrl = new URL(requested);
  const isLoopbackIp = (url: URL) => url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
  return (
    isLoopbackIp(registeredUrl) &&
    isLoopbackIp(requestedUrl) &&
    registeredUrl.hostname === requestedUrl.hostname &&
    registeredUrl.pathname === requestedUrl.pathname &&
    registeredUrl.search === requestedUrl.search
  );
}

export async function registerPublicClient(input: {
  clientName?: string;
  clientUri?: string;
  logoUri?: string;
  redirectUris: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  tokenEndpointAuthMethod?: string;
}) {
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0 || input.redirectUris.length > 20) {
    throw new OAuthError("invalid_client_metadata", "redirect_uris must contain 1 to 20 URLs");
  }
  const redirectUris = [...new Set(input.redirectUris.map(validateRedirectUri))];
  const grantTypes = input.grantTypes ?? ["authorization_code", "refresh_token"];
  const responseTypes = input.responseTypes ?? ["code"];
  if (grantTypes.some((value) => !["authorization_code", "refresh_token"].includes(value))) {
    throw new OAuthError("invalid_client_metadata", "Only authorization_code and refresh_token grants are supported");
  }
  if (responseTypes.length !== 1 || responseTypes[0] !== "code") {
    throw new OAuthError("invalid_client_metadata", "Only the code response type is supported");
  }
  if ((input.tokenEndpointAuthMethod ?? "none") !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only public clients with token_endpoint_auth_method=none are supported");
  }
  return prisma.mcpOAuthClient.create({
    data: {
      clientId: randomSecret("znx_client_"),
      clientName: input.clientName?.slice(0, 120),
      clientUri: input.clientUri,
      logoUri: input.logoUri,
      redirectUris,
      grantTypes,
      responseTypes,
    },
  });
}

export async function validateAuthorizationRequest(input: {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string | null;
  scope?: string | null;
}) {
  if (input.responseType !== "code") {
    throw new OAuthError("unsupported_response_type", "Only response_type=code is supported");
  }
  if (input.codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(input.codeChallenge)) {
    throw new OAuthError("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  const client = await prisma.mcpOAuthClient.findUnique({ where: { clientId: input.clientId } });
  if (!client) throw new OAuthError("invalid_request", "Unknown client_id");
  const redirectUri = validateRedirectUri(input.redirectUri);
  if (!client.redirectUris.some((registered) => redirectUriMatchesRegistration(registered, redirectUri))) {
    throw new OAuthError("invalid_request", "redirect_uri is not registered for this client");
  }
  const resource = assertCanonicalResource(input.resource);
  const scopes = parseScopes(input.scope);
  return { client, redirectUri, resource, scopes };
}

export async function assertBlogAccessible(userId: string, userEmail: string, blogId: string): Promise<void> {
  await assertBlogsAccessible(userId, userEmail, [blogId]);
}

export async function assertBlogsAccessible(userId: string, userEmail: string, blogIds: string[]) {
  const uniqueIds = [...new Set(blogIds.filter(Boolean))];
  if (uniqueIds.length === 0 || uniqueIds.length > 50) {
    throw new OAuthError("access_denied", "Select between 1 and 50 blogs", 403);
  }
  const blogs = await prisma.blog.findMany({
    where: {
      id: { in: uniqueIds },
      deletedAt: null,
      OR: [{ userId }, { members: { some: { userEmail: userEmail.toLowerCase().trim() } } }],
    },
    select: {
      id: true, blogId: true, name: true, slug: true, userId: true,
      members: { where: { userEmail: userEmail.toLowerCase().trim() }, select: { role: true }, take: 1 },
    },
  });
  if (blogs.length !== uniqueIds.length) {
    throw new OAuthError("access_denied", "You do not have access to every selected blog", 403);
  }
  const byId = new Map(blogs.map((blog) => [blog.id, blog]));
  return uniqueIds.map((id) => byId.get(id)!);
}

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  blogIds: string[];
  redirectUri: string;
  codeChallenge: string;
  scopes: ApiScope[];
  resource: string;
}): Promise<string> {
  const code = randomSecret("znx_ac_");
  await prisma.mcpOAuthAuthorizationCode.create({
    data: {
      codeHash: sha256Hex(code),
      clientId: input.clientId,
      userId: input.userId,
      blogIds: input.blogIds,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      scopes: input.scopes,
      resource: input.resource,
      expiresAt: expiresIn(AUTHORIZATION_CODE_TTL_SECONDS),
    },
  });
  return code;
}

export function verifyCodeChallenge(verifier: string, expected: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = crypto.createHash("sha256").update(verifier).digest("base64url");
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

async function createTokenPair(
  tx: Prisma.TransactionClient,
  grant: { id: string; scopes: string[]; resource: string },
  familyId: string = crypto.randomUUID(),
) {
  const accessToken = randomSecret("znx_at_");
  const refreshToken = randomSecret("znx_rt_");
  await tx.mcpOAuthAccessToken.create({
    data: {
      tokenHash: sha256Hex(accessToken),
      grantId: grant.id,
      scopes: grant.scopes,
      resource: grant.resource,
      expiresAt: expiresIn(ACCESS_TOKEN_TTL_SECONDS),
    },
  });
  await tx.mcpOAuthRefreshToken.create({
    data: {
      tokenHash: sha256Hex(refreshToken),
      grantId: grant.id,
      familyId,
      expiresAt: expiresIn(REFRESH_TOKEN_TTL_SECONDS),
    },
  });
  return { accessToken, refreshToken };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string | null;
}) {
  const resource = assertCanonicalResource(input.resource);
  return prisma.$transaction(async (tx) => {
    const authorizationCode = await tx.mcpOAuthAuthorizationCode.findUnique({
      where: { codeHash: sha256Hex(input.code) },
    });
    if (!authorizationCode || authorizationCode.usedAt || authorizationCode.expiresAt <= new Date()) {
      throw new OAuthError("invalid_grant", "Authorization code is invalid or expired");
    }
    if (
      authorizationCode.clientId !== input.clientId ||
      authorizationCode.redirectUri !== validateRedirectUri(input.redirectUri) ||
      authorizationCode.resource !== resource ||
      !verifyCodeChallenge(input.codeVerifier, authorizationCode.codeChallenge)
    ) {
      throw new OAuthError("invalid_grant", "Authorization code validation failed");
    }
    const claimed = await tx.mcpOAuthAuthorizationCode.updateMany({
      where: { id: authorizationCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new OAuthError("invalid_grant", "Authorization code was already used");

    const grant = await tx.mcpOAuthGrant.upsert({
      where: {
        clientId_userId_resource: {
          clientId: authorizationCode.clientId,
          userId: authorizationCode.userId,
          resource,
        },
      },
      create: {
        clientId: authorizationCode.clientId,
        userId: authorizationCode.userId,
        blogIds: authorizationCode.blogIds,
        scopes: authorizationCode.scopes,
        resource,
      },
      update: { blogIds: authorizationCode.blogIds, scopes: authorizationCode.scopes, revokedAt: null },
    });
    const now = new Date();
    await tx.mcpOAuthAccessToken.updateMany({ where: { grantId: grant.id, revokedAt: null }, data: { revokedAt: now } });
    await tx.mcpOAuthRefreshToken.updateMany({ where: { grantId: grant.id, revokedAt: null }, data: { revokedAt: now } });
    const tokens = await createTokenPair(tx, grant);
    return { ...tokens, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scope: grant.scopes.join(" ") };
  });
}

async function findRefreshTokenForUpdate(
  tx: Prisma.TransactionClient,
  tokenHash: string,
) {
  const token = await tx.mcpOAuthRefreshToken.findUnique({ where: { tokenHash }, select: { grantId: true } });
  if (!token) return null;
  // Lock the grant row: serializes concurrent refresh/revoke/reauthorize on it.
  await tx.$queryRaw`SELECT "id" FROM "McpOAuthGrant" WHERE "id" = ${token.grantId} FOR UPDATE`;
  return tx.mcpOAuthRefreshToken.findUnique({ where: { tokenHash }, include: { grant: true } });
}

export async function exchangeRefreshToken(input: { refreshToken: string; clientId: string; resource: string | null }) {
  const resource = assertCanonicalResource(input.resource);
  const result = await prisma.$transaction(async (tx) => {
    const current = await findRefreshTokenForUpdate(tx, sha256Hex(input.refreshToken));
    if (!current || current.grant.clientId !== input.clientId || current.grant.resource !== resource) {
      throw new OAuthError("invalid_grant", "Refresh token is invalid");
    }
    if (current.revokedAt || current.grant.revokedAt || current.expiresAt <= new Date()) {
      throw new OAuthError("invalid_grant", "Refresh token is expired or revoked");
    }
    if (current.rotatedAt) {
      // Reuse of an already-rotated token: treat as theft and kill the grant.
      const now = new Date();
      await tx.mcpOAuthGrant.update({ where: { id: current.grantId }, data: { revokedAt: now } });
      await tx.mcpOAuthAccessToken.updateMany({ where: { grantId: current.grantId }, data: { revokedAt: now } });
      await tx.mcpOAuthRefreshToken.updateMany({ where: { grantId: current.grantId }, data: { revokedAt: now } });
      return { reuseDetected: true as const };
    }
    const rotated = await tx.mcpOAuthRefreshToken.updateMany({
      where: { id: current.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (rotated.count !== 1) throw new OAuthError("invalid_grant", "Refresh token was already used");
    const tokens = await createTokenPair(tx, current.grant, current.familyId);
    return { reuseDetected: false as const, ...tokens, expiresIn: ACCESS_TOKEN_TTL_SECONDS, scope: current.grant.scopes.join(" ") };
  });
  if (result.reuseDetected) throw new OAuthError("invalid_grant", "Refresh token reuse detected; the grant was revoked");
  return result;
}

export async function revokeToken(rawToken: string, clientId: string): Promise<void> {
  const tokenHash = sha256Hex(rawToken);
  await prisma.$transaction(async (tx) => {
    const access = await tx.mcpOAuthAccessToken.findUnique({ where: { tokenHash }, include: { grant: true } });
    if (access?.grant.clientId === clientId) {
      await tx.mcpOAuthAccessToken.update({ where: { id: access.id }, data: { revokedAt: new Date() } });
      return;
    }
    const refresh = await findRefreshTokenForUpdate(tx, tokenHash);
    if (refresh?.grant.clientId === clientId && !refresh.revokedAt && !refresh.grant.revokedAt && refresh.expiresAt > new Date()) {
      const now = new Date();
      await tx.mcpOAuthGrant.update({ where: { id: refresh.grantId }, data: { revokedAt: now } });
      await tx.mcpOAuthAccessToken.updateMany({ where: { grantId: refresh.grantId }, data: { revokedAt: now } });
      await tx.mcpOAuthRefreshToken.updateMany({ where: { grantId: refresh.grantId }, data: { revokedAt: now } });
    }
  });
}

export async function resolveOAuthAccessToken(rawToken: string): Promise<ApiPrincipal | null> {
  if (!rawToken.startsWith("znx_at_")) return null;
  const token = await prisma.mcpOAuthAccessToken.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    include: {
      grant: {
        include: {
          user: { select: { id: true, email: true } },
        },
      },
    },
  });
  if (!token || token.revokedAt || token.expiresAt <= new Date() || token.grant.revokedAt) return null;
  if (!acceptedResources().has(token.resource)) return null;

  // Membership can change after the grant was created (RFC 6749 doesn't
  // require this, but a removed member should lose access promptly).
  let blogs;
  try {
    blogs = await assertBlogsAccessible(token.grant.user.id, token.grant.user.email, token.grant.blogIds);
  } catch {
    return null;
  }

  void prisma.mcpOAuthAccessToken
    .updateMany({ where: { id: token.id, revokedAt: null }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      // Usage metadata must not affect authentication or leak token details.
    });

  // A connection never does more on a blog than the person's current role there allows.
  const authorizedBlogs = blogs.map((blog) => {
    const role: BlogAccessRole = blog.userId === token.grant.user.id ? "owner" : isBlogRole(blog.members[0]?.role) ? blog.members[0].role as BlogRole : "viewer";
    const allowed = new Set<string>(roleApiScopes(role));
    return {
      blogId: blog.id,
      publicBlogId: blog.blogId,
      name: blog.name,
      slug: blog.slug,
      scopes: token.scopes.filter((scope) => allowed.has(scope)),
      canUsePaidSeo: can(role, "autopilot.manage"),
    };
  });
  const primary = authorizedBlogs[0];
  return {
    blogId: primary.blogId,
    publicBlogId: primary.publicBlogId,
    keyId: `oauth:${token.id}`,
    // Tools are listed if any blog allows them; each call is checked against its blog's scopes.
    scopes: [...new Set(authorizedBlogs.flatMap((blog) => blog.scopes))],
    authorizedBlogs,
    canUsePaidSeo: primary.canUsePaidSeo,
  };
}
