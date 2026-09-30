"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { API_SCOPES } from "@/lib/integrations/scopes";
import { ApiError, apiError } from "@/lib/integrations/errors";

const updateSchema = z.object({
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length).refine(items => new Set(items).size === items.length, "Duplicate scopes"),
}).strict();

async function currentUserGrant(blogId: string, grantId: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage MCP connections");
  const grant = await prisma.mcpOAuthGrant.findFirst({
    where: { id: grantId, userId: session.user.id, blogIds: { has: blogId } },
    select: { id: true },
  });
  if (!grant) throw new ApiError(404, "MCP connection not found");
  return grant;
}

export async function listMcpConnections(blogId: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to manage MCP connections");
  const grants = await prisma.mcpOAuthGrant.findMany({
    where: { userId: session.user.id, blogIds: { has: blogId } },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { clientName: true, clientUri: true } },
      accessTokens: { orderBy: { lastUsedAt: "desc" }, take: 1, select: { lastUsedAt: true } },
    },
  });
  const blogIds = [...new Set(grants.flatMap(grant => grant.blogIds))];
  const blogs = await prisma.blog.findMany({ where: { id: { in: blogIds }, deletedAt: null }, select: { id: true, name: true } });
  const names = new Map(blogs.map(blog => [blog.id, blog.name]));
  return grants.map(grant => ({
    id: grant.id,
    clientName: grant.client.clientName?.trim() || "MCP client",
    clientUri: grant.client.clientUri,
    scopes: grant.scopes,
    blogs: grant.blogIds.map(id => ({ id, name: names.get(id) || "Unavailable blog" })),
    createdAt: grant.createdAt.toISOString(),
    revokedAt: grant.revokedAt?.toISOString() ?? null,
    lastUsedAt: grant.accessTokens[0]?.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function updateMcpConnection(blogId: string, grantId: string, input: unknown) {
  try {
    await currentUserGrant(blogId, grantId);
    const data = updateSchema.parse(input);
    await prisma.$transaction([
      prisma.mcpOAuthGrant.update({ where: { id: grantId }, data: { scopes: data.scopes, revokedAt: null } }),
      prisma.mcpOAuthAccessToken.updateMany({ where: { grantId, revokedAt: null }, data: { scopes: data.scopes } }),
    ]);
    revalidatePath(`/dashboard/blogs/${blogId}/mcp`);
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function revokeMcpConnection(blogId: string, grantId: string) {
  try {
    await currentUserGrant(blogId, grantId);
    const now = new Date();
    await prisma.$transaction([
      prisma.mcpOAuthGrant.update({ where: { id: grantId }, data: { revokedAt: now } }),
      prisma.mcpOAuthAccessToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } }),
      prisma.mcpOAuthRefreshToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    revalidatePath(`/dashboard/blogs/${blogId}/mcp`);
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}
