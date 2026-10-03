import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { ApiError } from "@/lib/integrations/errors";
import { can, isBlogRole, permissionsOf, type BlogAccessRole, type BlogPermission } from "@/lib/permissions";

const normalizeEmail = (email: string | null | undefined) => email?.trim().toLowerCase() ?? "";

/** A user's role on a blog: owner, the role they were invited with, or null without access. */
export async function getBlogRole(userId: string, email: string | null | undefined, blogId: string): Promise<BlogAccessRole | null> {
  const blog = await prisma.blog.findFirst({
    where: { id: blogId, deletedAt: null },
    select: { userId: true, members: { where: { userEmail: normalizeEmail(email) }, select: { role: true }, take: 1 } },
  });
  if (!blog || !userId) return null;
  if (blog.userId === userId) return "owner";
  const role = blog.members[0]?.role;
  if (!email || role === undefined) return null;
  // An unknown value (a role removed later) falls back to the least access.
  return isBlogRole(role) ? role : "viewer";
}

export type BlogAccess = {
  userId: string;
  email: string;
  role: BlogAccessRole;
  /** Every permission as a boolean, ready for client components. */
  permissions: Record<BlogPermission, boolean>;
  can: (permission: BlogPermission) => boolean;
};

/** The signed-in user's access to a blog, or null. Cached per request, so pages and layouts can share it. */
export const getBlogAccess = cache(async (blogId: string): Promise<BlogAccess | null> => {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const role = await getBlogRole(session.user.id, session.user.email, blogId);
  if (!role) return null;
  return {
    userId: session.user.id,
    email: normalizeEmail(session.user.email),
    role,
    permissions: permissionsOf(role),
    can: (permission) => can(role, permission),
  };
});

/** For server actions and routes: the caller's access, or a 401/403 naming what is missing. */
export async function requireBlogPermission(blogId: string, permission: BlogPermission): Promise<BlogAccess> {
  const session = await getSession();
  if (!session?.user?.id) throw new ApiError(401, "Sign in to continue");
  const access = await getBlogAccess(blogId);
  if (!access) throw new ApiError(403, "You don't have access to this blog");
  if (!access.can(permission)) throw new ApiError(403, forbiddenMessage(permission));
  return access;
}

/** Plain-language refusals; the role table in the docs lists who can do what. */
export function forbiddenMessage(permission: BlogPermission) {
  switch (permission) {
    case "content.write": case "autopilot.write": return "Your role on this blog can only view it";
    case "account.manage": case "account.spending": case "blog.delete": return "Only the blog owner can do this";
    default: return "Only blog admins can do this";
  }
}
