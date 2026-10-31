import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

process.env.NEXTAUTH_URL ||= "http://localhost:4444";

const state = vi.hoisted(() => ({ db: null as unknown as PrismaClient, session: null as null | { user: { id: string; email: string } } }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/get-session", () => ({ getSession: async () => state.session }));
import { POST as registerClient } from "@/app/api/oauth/register/route";
import { POST as authorizeDecision } from "@/app/api/oauth/authorize/route";
import { POST as tokenExchange } from "@/app/api/oauth/token/route";
import { POST as revokeTokenRoute } from "@/app/api/oauth/revoke/route";
import { POST as mcpPost } from "@/app/api/mcp/route";

const connection = process.env.ZENEX_TEST_DATABASE_URL;
const ORIGIN = "http://localhost";
const REDIRECT_URI = "https://client.example/callback";

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

describe.runIf(!!connection)("isolated PostgreSQL MCP OAuth integration", () => {
  let blog: { id: string; blogId: string };
  let other: { id: string; blogId: string };
  let owner: { id: string; email: string };
  let clientId: string;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/zenex_integration_test") {
      throw new Error("Tests require the dedicated local zenex_integration_test database");
    }
    state.db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: connection, max: 10 })) });
  });
  beforeEach(async () => {
    await state.db.user.deleteMany({ where: { email: { endsWith: "@zenex-oauth.test" } } });
    await state.db.mcpOAuthClient.deleteMany({});
    owner = await state.db.user.create({ data: { email: "owner@zenex-oauth.test", name: "Owner" } });
    blog = await state.db.blog.create({ data: { userId: owner.id, name: "Test", slug: "test" } });
    other = await state.db.blog.create({ data: { userId: owner.id, name: "Other", slug: "other" } });
    state.session = { user: owner };
    const registered = await registerClient(
      new Request("http://localhost/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "Test client", redirect_uris: [REDIRECT_URI] }),
      }),
    );
    expect(registered.status).toBe(201);
    clientId = (await registered.json()).client_id;
  });
  afterAll(async () => {
    if (state.db) {
      await state.db.user.deleteMany({ where: { email: { endsWith: "@zenex-oauth.test" } } });
      await state.db.mcpOAuthClient.deleteMany({});
      await state.db.$disconnect();
    }
  });

  const resource = () => `http://localhost:4444/api/mcp`;
  const authorize = (form: Record<string, string | string[]>) => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
      for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
    }
    return authorizeDecision(
      new Request("http://localhost/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN },
        body: body.toString(),
      }),
    );
  };
  const exchange = (form: Record<string, string>) =>
    tokenExchange(
      new Request("http://localhost/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      }),
    );
  const mcpCall = (token: string) =>
    mcpPost(
      new Request("http://localhost/api/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );

  async function approveAndExchange(blogIds: string[]) {
    const { verifier, challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: resource(),
      state: "xyz",
      blog_ids: blogIds,
      decision: "approve",
    });
    expect(authorized.status).toBe(303);
    const location = new URL(authorized.headers.get("location")!);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = location.searchParams.get("code")!;
    expect(code).toBeTruthy();

    const tokenResponse = await exchange({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: resource(),
    });
    expect(tokenResponse.status).toBe(200);
    return tokenResponse.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }>;
  }

  it("completes the authorization_code + PKCE flow for all selected blogs", async () => {
    const tokens = await approveAndExchange([blog.id, other.id]);
    expect(tokens.access_token).toMatch(/^znx_at_/);
    expect(tokens.refresh_token).toMatch(/^znx_rt_/);

    const result = await mcpCall(tokens.access_token);
    expect(result.status).toBe(200);

    const grant = await state.db.mcpOAuthGrant.findUniqueOrThrow({
      where: { clientId_userId_resource: { clientId, userId: owner.id, resource: resource() } },
    });
    expect(grant.blogIds).toEqual([blog.id, other.id]);
    expect(result.status).toBe(200);
  });

  it("rejects an authorize request for a blog the user cannot access", async () => {
    const stranger = await state.db.blog.create({ data: { userId: (await state.db.user.create({ data: { email: "stranger@zenex-oauth.test" } })).id, name: "Stranger", slug: "stranger" } });
    const { challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: resource(),
      state: "denied-blog",
      blog_id: stranger.id,
      decision: "approve",
    });
    // redirect_uri is already known-valid at this point, so the error is
    // reported via redirect (per the OAuth spec), not as a raw status code.
    expect(authorized.status).toBe(303);
    const location = new URL(authorized.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("denied-blog");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("rejects a decision=deny by redirecting with access_denied and never issues a code", async () => {
    const { challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: resource(),
      state: "abc",
      blog_id: blog.id,
      decision: "deny",
    });
    expect(authorized.status).toBe(303);
    const location = new URL(authorized.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("code")).toBeNull();
  });

  it("rejects a code_verifier that does not match the original challenge", async () => {
    const { challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: resource(),
      blog_id: blog.id,
      decision: "approve",
    });
    const code = new URL(authorized.headers.get("location")!).searchParams.get("code")!;
    const tokenResponse = await exchange({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      code_verifier: pkcePair().verifier,
      resource: resource(),
    });
    expect(tokenResponse.status).toBe(400);
    expect((await tokenResponse.json()).error).toBe("invalid_grant");
  });

  it("rejects an authorization code that is replayed", async () => {
    const { verifier, challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: resource(),
      blog_id: blog.id,
      decision: "approve",
    });
    const code = new URL(authorized.headers.get("location")!).searchParams.get("code")!;
    const form = { grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: verifier, resource: resource() };
    expect((await exchange(form)).status).toBe(200);
    expect((await exchange(form)).status).toBe(400);
  });

  it("rotates refresh tokens and revokes the whole grant on reuse", async () => {
    const tokens = await approveAndExchange([blog.id]);
    const refreshed = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, resource: resource() });
    expect(refreshed.status).toBe(200);
    const rotated = await refreshed.json();
    expect(rotated.access_token).not.toBe(tokens.access_token);
    expect((await mcpCall(rotated.access_token)).status).toBe(200);

    // Reusing the already-rotated refresh token after the grace window must revoke the whole grant.
    await state.db.mcpOAuthRefreshToken.update({
      where: { tokenHash: crypto.createHash("sha256").update(tokens.refresh_token).digest("hex") },
      data: { rotatedAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    const reuse = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, resource: resource() });
    expect(reuse.status).toBe(400);
    expect((await mcpCall(rotated.access_token)).status).toBe(401);
  });

  it("tolerates a concurrent refresh with the just-rotated token", async () => {
    const tokens = await approveAndExchange([blog.id]);
    const form = { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, resource: resource() };
    const first = await (await exchange(form)).json();
    const second = await exchange(form);
    expect(second.status).toBe(200);
    const retried = await second.json();
    expect(retried.access_token).not.toBe(first.access_token);
    expect((await mcpCall(first.access_token)).status).toBe(200);
    expect((await mcpCall(retried.access_token)).status).toBe(200);
  });

  it("defaults an omitted resource and ignores a trailing slash", async () => {
    const { verifier, challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      blog_ids: [blog.id],
      decision: "approve",
    });
    expect(authorized.status).toBe(303);
    const code = new URL(authorized.headers.get("location")!).searchParams.get("code")!;
    const issued = await exchange({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: REDIRECT_URI, code_verifier: verifier, resource: `${resource()}/` });
    expect(issued.status).toBe(200);
    const tokens = await issued.json();
    const refreshed = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId });
    expect(refreshed.status).toBe(200);
    expect((await mcpCall((await refreshed.json()).access_token)).status).toBe(200);
  });

  it("revokes an access token via /api/oauth/revoke", async () => {
    const tokens = await approveAndExchange([blog.id]);
    expect((await mcpCall(tokens.access_token)).status).toBe(200);
    const revoked = await revokeTokenRoute(
      new Request("http://localhost/api/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.access_token, client_id: clientId }).toString(),
      }),
    );
    expect(revoked.status).toBe(200);
    expect((await mcpCall(tokens.access_token)).status).toBe(401);
  });

  it("stops authenticating once the user loses access to the granted blog", async () => {
    const tokens = await approveAndExchange([blog.id]);
    await state.db.blog.update({ where: { id: blog.id }, data: { userId: (await state.db.user.create({ data: { email: "newowner@zenex-oauth.test" } })).id } });
    expect((await mcpCall(tokens.access_token)).status).toBe(401);
  });

  it("rejects a resource that does not match this deployment's canonical MCP resource", async () => {
    const { challenge } = pkcePair();
    const authorized = await authorize({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "https://not-this-cms.example/api/mcp",
      blog_id: blog.id,
      decision: "approve",
    });
    expect(authorized.status).toBe(400);
  });
});
