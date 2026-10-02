import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { requireScope, type ApiPrincipal } from "@/lib/integrations/auth";
import { OPERATIONS, type OperationName, type ContentResource } from "@/lib/integrations/catalog";
import * as schemas from "@/lib/integrations/schemas";
import { uploadBlogImage } from "@/src/server/services/media/upload";
import { rasterizeSvg, uploadBrandAsset } from "@/src/server/services/growth/image-references";
import { cancelPostSchedule, syncPostSchedule } from "@/src/server/services/scheduling/service";
import { translatePostInto } from "@/src/server/services/translations/post-translation";
import { queueTranslationSync } from "@/src/server/services/translations/auto-sync";
import { queueRelatedArticleLinks } from "@/src/server/services/growth/backlinks";
import { normalizeBlogLanguages } from "@/lib/blog-languages";
import { syncSeoLanguage } from "@/src/server/services/seo/service";

const itemInput = z.object({ id: schemas.idSchema }).strict();
export const operationSchemas: Record<OperationName, z.ZodType> = {
  upload_image: schemas.imageUploadSchema,
  get_blog: z.object({}).strict(), update_blog: schemas.blogUpdateSchema,
  list_posts: schemas.postListSchema, get_posts: itemInput,
  create_posts: schemas.postCreateSchema, update_posts: schemas.postUpdateSchema.safeExtend({ id: schemas.idSchema }), delete_posts: itemInput,
  list_categories: schemas.listSchema, get_categories: itemInput,
  create_categories: schemas.categorySchema, update_categories: schemas.categoryUpdateSchema.safeExtend({ id: schemas.idSchema }), delete_categories: itemInput,
  list_tags: schemas.listSchema, get_tags: itemInput,
  create_tags: schemas.tagSchema, update_tags: schemas.tagUpdateSchema.safeExtend({ id: schemas.idSchema }), delete_tags: itemInput,
  list_authors: schemas.listSchema, get_authors: itemInput,
  create_authors: schemas.authorSchema, update_authors: schemas.authorUpdateSchema.safeExtend({ id: schemas.idSchema }), delete_authors: itemInput,
  translate_posts: schemas.translatePostSchema,
};
const postInclude = { categories: { include: { category: true } }, tags: { include: { tag: true } }, author: true } satisfies Prisma.PostInclude;
const blogSelect = { id: true, blogId: true, name: true, slug: true, description: true, languages: true, autoSyncTranslations: true, createdAt: true, updatedAt: true } satisfies Prisma.BlogSelect;

async function findRecord(resource: ContentResource, blogId: string, id: string) {
  const where = { id, blogId };
  switch (resource) {
    case "posts": return prisma.post.findFirst({ where, include: postInclude });
    case "categories": return prisma.category.findFirst({ where });
    case "tags": return prisma.tag.findFirst({ where });
    case "authors": return prisma.author.findFirst({ where });
  }
}

async function validatePostRelations(tx: Prisma.TransactionClient, blogId: string, data: z.infer<typeof schemas.postUpdateSchema>) {
  for (const [resource, ids] of [["category", data.categoryIds], ["tag", data.tagIds]] as const) {
    if (ids?.length) {
      const where = { blogId, id: { in: ids } };
      const count = resource === "category" ? await tx.category.count({ where }) : await tx.tag.count({ where });
      if (count !== ids.length) throw new ApiError(400, `Every ${resource} must belong to this blog`);
    }
  }
  if (data.authorId && !await tx.author.findFirst({ where: { id: data.authorId, blogId }, select: { id: true } })) {
    throw new ApiError(400, "Author must belong to this blog");
  }
  if (data.translationGroupId && !await tx.post.findFirst({ where: { translationGroupId: data.translationGroupId, blogId }, select: { id: true } })) {
    throw new ApiError(400, "Translation group must already exist in this blog");
  }
}

const isLive = (status?: string) => status === "published" || status === "scheduled";

async function writePost(principal: ApiPrincipal, input: unknown, id?: string) {
  const data = id ? schemas.postUpdateSchema.parse(input) : schemas.postCreateSchema.parse(input);
  const { categoryIds, tagIds, content, publishedAt, ...fields } = data;
  const { post, previous } = await prisma.$transaction(async tx => {
    // Serialize publication checks against concurrent writes to this post.
    if (id) await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} AND "blogId" = ${principal.blogId} FOR UPDATE`;
    const current = id ? await tx.post.findFirst({ where: { id, blogId: principal.blogId } }) : null;
    if (id && !current) throw new ApiError(404, "Post not found");
    // Scheduling is a deferred publish, so it needs the same permission.
    if (isLive(current?.status) || isLive(data.status) || data.publishedAt !== undefined) requireScope(principal, "content:publish");
    await validatePostRelations(tx, principal.blogId, data);
    const date = publishedAt === null ? null : publishedAt ? new Date(publishedAt) : undefined;
    const status = data.status ?? current?.status;
    let nextPublishedAt = date;
    if (status === "published") {
      // Publishing a scheduled post early goes live now, not at its future date.
      const keep = current?.status === "scheduled" ? undefined : current?.publishedAt;
      nextPublishedAt = date ?? keep ?? new Date();
    } else if (status === "scheduled") {
      nextPublishedAt = date === undefined ? current?.publishedAt : date;
      if (!nextPublishedAt || nextPublishedAt.getTime() <= Date.now()) {
        throw new ApiError(400, "A scheduled post needs a publishedAt in the future");
      }
    }
    const values = {
      ...fields,
      ...(content !== undefined ? { content: content as Prisma.InputJsonValue } : {}),
      publishedAt: nextPublishedAt,
      categories: categoryIds !== undefined ? { ...(id ? { deleteMany: {} } : {}), create: categoryIds.map(categoryId => ({ categoryId })) } : undefined,
      tags: tagIds !== undefined ? { ...(id ? { deleteMany: {} } : {}), create: tagIds.map(tagId => ({ tagId })) } : undefined,
    };
    if (id) return { previous: current, post: await tx.post.update({ where: { id, blogId: principal.blogId }, data: values, include: postInclude }) };
    const required = schemas.postCreateSchema.parse(input);
    return { previous: null, post: await tx.post.create({ data: {
      ...values, title: required.title, slug: required.slug,
      content: required.content as Prisma.InputJsonValue, language: required.language, status: required.status,
      blogId: principal.blogId, translationGroupId: required.translationGroupId ?? randomUUID(),
    }, include: postInclude }) };
  });
  const scheduleChanged = previous?.status !== post.status || previous?.publishedAt?.getTime() !== post.publishedAt?.getTime();
  if (scheduleChanged && (previous?.status === "scheduled" || post.status === "scheduled")) {
    await syncPostSchedule(post.id, previous?.scheduleMessageId ?? null);
  }
  await queueTranslationSync(principal.blogId, previous, post);
  if (post.status === "published" && previous?.status !== "published") queueRelatedArticleLinks(post.id);
  return post;
}

async function listRecords(resource: ContentResource, blogId: string, input: unknown) {
  const query = (resource === "posts" ? schemas.postListSchema : schemas.listSchema).parse(input);
  const args = { skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { id: "asc" as const } };
  let data: unknown[];
  let total: number;
  switch (resource) {
    case "posts": {
      const q = schemas.postListSchema.parse(input);
      const where: Prisma.PostWhereInput = {
        blogId, status: q.status === "all" ? undefined : q.status, language: q.language,
        ...(q.publishedFrom || q.publishedTo ? { publishedAt: {
          ...(q.publishedFrom ? { gte: new Date(q.publishedFrom) } : {}),
          ...(q.publishedTo ? { lt: new Date(q.publishedTo) } : {}),
        } } : {}),
        ...(q.search ? { title: { contains: q.search, mode: "insensitive" } } : {}),
        ...(q.categoryId ? { categories: { some: { categoryId: q.categoryId } } } : {}),
        ...(q.tagId ? { tags: { some: { tagId: q.tagId } } } : {}),
      };
      [data, total] = await Promise.all([prisma.post.findMany({ where, ...args, include: postInclude }), prisma.post.count({ where })]);
      break;
    }
    case "categories": [data, total] = await Promise.all([prisma.category.findMany({ where: { blogId }, ...args }), prisma.category.count({ where: { blogId } })]); break;
    case "tags": [data, total] = await Promise.all([prisma.tag.findMany({ where: { blogId }, ...args }), prisma.tag.count({ where: { blogId } })]); break;
    case "authors": [data, total] = await Promise.all([prisma.author.findMany({ where: { blogId }, ...args }), prisma.author.count({ where: { blogId } })]); break;
  }
  return { data, pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
}

/** Shared by REST, MCP and dashboard adapters. No transport/session state is stored here. */
export async function executeOperation(principal: ApiPrincipal, name: OperationName, input: unknown) {
  const operation = OPERATIONS.find(o => o.name === name);
  if (!operation) throw new ApiError(404, "Unknown operation");
  requireScope(principal, operation.scope);
  operationSchemas[name].parse(input);
  const blogId = principal.blogId;
  if (name === "upload_image") {
    const data = schemas.imageUploadSchema.parse(input);
    const bytes = Buffer.from(data.base64, "base64");
    if (data.purpose !== "content") {
      requireScope(principal, "seo:write");
      const url = await uploadBrandAsset(blogId, data.purpose === "logo" ? "brand" : "references", bytes, data.mimeType);
      return { data: { url, purpose: data.purpose } };
    }
    // SVGs are stored as PNG (see rasterizeSvg).
    return data.mimeType === "image/svg+xml"
      ? { data: await uploadBlogImage(blogId, await rasterizeSvg(bytes), "image/png", 700 * 1024) }
      : { data: await uploadBlogImage(blogId, bytes, data.mimeType, 700 * 1024) };
  }
  if (name === "get_blog") {
    const blog = await prisma.blog.findFirst({ where: { id: blogId, deletedAt: null }, select: blogSelect });
    if (!blog) throw new ApiError(404, "Blog not found");
    return { data: blog };
  }
  if (name === "update_blog") {
    const data = schemas.blogUpdateSchema.parse(input);
    const blog = await prisma.blog.findFirst({ where: { id: blogId, deletedAt: null } });
    if (!blog) throw new ApiError(404, "Blog not found");
    if (data.slug && await prisma.blog.findFirst({ where: { userId: blog.userId, slug: data.slug, id: { not: blogId }, deletedAt: null }, select: { id: true } })) throw new ApiError(409, "Blog slug already exists");
    // Same rules as the dashboard: one language cannot sync, and the main language drives Autopilot.
    const languages = data.languages ? normalizeBlogLanguages(data.languages) : blog.languages;
    const autoSyncTranslations = languages.length > 1 && (data.autoSyncTranslations ?? blog.autoSyncTranslations);
    const updated = await prisma.blog.update({
      where: { id: blogId },
      data: { ...data, ...(data.languages ? { languages } : {}), autoSyncTranslations },
      select: blogSelect,
    });
    if (data.languages && blog.languages[0] !== languages[0]) {
      await syncSeoLanguage(blogId, languages[0]);
    }
    return { data: updated };
  }
  if (name === "translate_posts") {
    const { id, languages, paths } = schemas.translatePostSchema.parse(input);
    const source = await prisma.post.findFirst({ where: { id, blogId }, select: { status: true } });
    if (!source) throw new ApiError(404, "Post not found");
    if (isLive(source.status)) requireScope(principal, "content:publish");
    return { data: await translatePostInto(blogId, id, languages, paths) };
  }
  const [verb, resourceName] = name.split("_");
  const resource = resourceName as ContentResource;
  if (verb === "list") return listRecords(resource, blogId, input);
  if (verb === "create") {
    switch (resource) {
      case "posts": return { data: await writePost(principal, input) };
      case "categories": return { data: await prisma.category.create({ data: { ...schemas.categorySchema.parse(input), blogId } }) };
      case "tags": return { data: await prisma.tag.create({ data: { ...schemas.tagSchema.parse(input), blogId } }) };
      case "authors": return { data: await prisma.author.create({ data: { ...schemas.authorSchema.parse(input), blogId } }) };
    }
  }
  const { id, ...fields } = input as { id: string; [key: string]: unknown };
  const record = await findRecord(resource, blogId, id);
  if (!record) throw new ApiError(404, "Record not found");
  if (verb === "get") return { data: record };
  if (verb === "update") {
    switch (resource) {
      case "posts": return { data: await writePost(principal, fields, id) };
      case "categories": return { data: await prisma.category.update({ where: { id, blogId }, data: schemas.categoryUpdateSchema.parse(fields) }) };
      case "tags": return { data: await prisma.tag.update({ where: { id, blogId }, data: schemas.tagUpdateSchema.parse(fields) }) };
      case "authors": return { data: await prisma.author.update({ where: { id, blogId }, data: schemas.authorUpdateSchema.parse(fields) }) };
    }
  }
  switch (resource) {
    case "posts": {
      const deleted = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} AND "blogId" = ${blogId} FOR UPDATE`;
        const post = await tx.post.findFirstOrThrow({ where: { id, blogId } });
        if (isLive(post.status)) requireScope(principal, "content:publish");
        await tx.post.delete({ where: { id, blogId } });
        return post;
      });
      await cancelPostSchedule(deleted.scheduleMessageId);
      break;
    }
    case "categories": await prisma.category.delete({ where: { id, blogId } }); break;
    case "tags": await prisma.tag.delete({ where: { id, blogId } }); break;
    case "authors": await prisma.author.delete({ where: { id, blogId } }); break;
  }
  return { data: { id, deleted: true } };
}
