import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { roleApiScopes } from "@/lib/permissions";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { ApiError } from "@/lib/integrations/errors";
import type { OperationName, ContentResource } from "@/lib/integrations/catalog";
import { executeOperation } from "./service";
import { invalidateContent } from "./cache";

export async function dashboardOperation(blogId: string, name: OperationName, input: unknown) {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Unauthorized");
  const access = await getBlogAccess(blogId);
  const blog = access ? await prisma.blog.findFirst({ where: { id: blogId, deletedAt: null }, select: { blogId: true } }) : null;
  if (!access || !blog) throw new ApiError(403, "Unauthorized");
  // The role decides the scopes, so the dashboard and API clients follow the same rules.
  const principal = { blogId, publicBlogId: blog.blogId, keyId: "session", scopes: roleApiScopes(access.role) };
  try {
    const result = await executeOperation(principal, name, input);
    invalidateContent(principal, true);
    return result.data;
  } catch (error) {
    // "Missing scope: content:write" is for API clients; people see what their role allows.
    if (error instanceof ApiError && error.message.startsWith("Missing scope")) {
      throw new ApiError(403, access.can("content.write") ? "Only blog admins can do this" : "Your role on this blog can only view it");
    }
    throw error;
  }
}

export async function recordBlogId(resource: ContentResource, id: string) {
  // Never mutate/read content here; resolve tenant before dashboard authorization.
  const args = { where: { id }, select: { blogId: true } };
  const record = resource === "posts" ? await prisma.post.findUnique(args)
    : resource === "categories" ? await prisma.category.findUnique(args)
      : resource === "tags" ? await prisma.tag.findUnique(args) : await prisma.author.findUnique(args);
  if (!record) throw new ApiError(404, "Record not found");
  return record.blogId;
}
