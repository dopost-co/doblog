import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { ApiError } from "@/lib/integrations/errors";
import { normalizeBlogLanguages } from "@/lib/blog-languages";
import { defaultSearchMarket } from "@/lib/autopilot/search-markets";
import type { ApiPrincipal } from "@/lib/integrations/auth";
import { normalizeWebsite } from "@/src/server/services/growth/discovery";

export const createBlogInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** The first one is the main language; Autopilot writes in it. */
  languages: z.array(z.string().trim().min(2).max(5)).min(1).max(5).default(["en"]),
  website: z.string().trim().min(3).max(2048).optional(),
}).strict();

/**
 * Creates a blog owned by the person behind an MCP connection and adds it to
 * that connection, so the same client can configure it right away.
 */
export async function createBlogForConnection(principal: ApiPrincipal, raw: unknown) {
  const input = createBlogInputSchema.parse(raw);
  const tokenId = principal.keyId.startsWith("oauth:") ? principal.keyId.slice("oauth:".length) : null;
  if (!tokenId) throw new ApiError(403, "Creating blogs needs an OAuth connection, not a blog API key");
  const token = await prisma.mcpOAuthAccessToken.findUnique({ where: { id: tokenId }, select: { grant: { select: { id: true, userId: true, blogIds: true, revokedAt: true } } } });
  if (!token || token.grant.revokedAt) throw new ApiError(401, "This connection is no longer valid");
  if (token.grant.blogIds.length >= 50) throw new ApiError(409, "This connection already manages 50 blogs");

  let languages: string[];
  try { languages = normalizeBlogLanguages(input.languages); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "Choose the blog languages"); }
  const targetDomain = input.website ? normalizeWebsite(input.website) : null;

  const userId = token.grant.userId;
  const existing = await prisma.blog.findMany({ where: { userId, deletedAt: null }, select: { slug: true } });
  const slugs = new Set(existing.map((blog) => blog.slug));
  const base = slugify(input.name) || "blog";
  let slug = base;
  for (let n = 2; slugs.has(slug); n++) slug = `${base}-${n}`;

  const blog = await prisma.$transaction(async (tx) => {
    const created = await tx.blog.create({
      data: { userId, name: input.name, slug, languages, autoSyncTranslations: languages.length > 1, contentMode: "both" },
      select: { id: true, blogId: true, name: true, slug: true },
    });
    await tx.blogSeoSettings.create({ data: {
      blogId: created.id, languageCode: languages[0], locationCode: defaultSearchMarket(languages[0]),
      publishingMode: "auto_publish", ...(targetDomain ? { targetDomain } : {}),
    } });
    await tx.mcpOAuthGrant.update({ where: { id: token.grant.id }, data: { blogIds: { push: created.id } } });
    return created;
  });
  return { blogId: blog.blogId, name: blog.name, slug: blog.slug, languages, website: targetDomain };
}
