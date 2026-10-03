"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { apiError, ApiError } from "@/lib/integrations/errors";
import { BLOG_ROLES, DEFAULT_BLOG_ROLE } from "@/lib/permissions";
import { requireBlogPermission } from "@/src/server/services/blogs/access";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
const roleSchema = z.enum(BLOG_ROLES, { message: "Choose viewer, member or admin" });

function revalidateMembers(blogId: string) {
  revalidatePath(`/dashboard/blogs/${blogId}/settings/members`);
  revalidatePath("/dashboard");
}

/** Gives someone access to the blog with a role; they get it when they sign in with that email. */
export async function addBlogMember(blogId: string, email: string, role: string = DEFAULT_BLOG_ROLE) {
  try {
    await requireBlogPermission(blogId, "members.manage");
    const userEmail = emailSchema.parse(email);
    const validRole = roleSchema.parse(role);
    const blog = await prisma.blog.findFirst({ where: { id: blogId, deletedAt: null }, select: { user: { select: { email: true } } } });
    if (!blog) throw new ApiError(404, "Blog not found");
    if (blog.user.email.toLowerCase() === userEmail) throw new ApiError(409, "That's the blog owner, who already has full access");
    const existing = await prisma.blogMember.findUnique({ where: { blogId_userEmail: { blogId, userEmail } }, select: { id: true } });
    if (existing) throw new ApiError(409, "This email already has access. Change its role instead");

    const member = await prisma.blogMember.create({ data: { blogId, userEmail, role: validRole } });
    const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true, name: true, email: true } });
    revalidateMembers(blogId);
    return { success: true, member: { ...member, role: validRole, user } };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : apiError(error).error };
  }
}

export async function updateBlogMemberRole(blogId: string, memberId: string, role: string) {
  try {
    const access = await requireBlogPermission(blogId, "members.manage");
    const validRole = roleSchema.parse(role);
    const member = await prisma.blogMember.findFirst({ where: { id: memberId, blogId }, select: { userEmail: true } });
    if (!member) throw new ApiError(404, "Member not found");
    // Admins can't lower their own role by accident and lock themselves out of this page.
    if (member.userEmail === access.email && validRole !== "admin") throw new ApiError(409, "Ask the owner or another admin to change your own role");
    await prisma.blogMember.update({ where: { id: memberId }, data: { role: validRole } });
    revalidateMembers(blogId);
    return { success: true, role: validRole };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0].message : apiError(error).error };
  }
}

export async function removeBlogMember(blogId: string, memberId: string) {
  try {
    await requireBlogPermission(blogId, "members.manage");
    const removed = await prisma.blogMember.deleteMany({ where: { id: memberId, blogId } });
    if (!removed.count) throw new ApiError(404, "Member not found");
    revalidateMembers(blogId);
    return { success: true };
  } catch (error) {
    return { error: apiError(error).error };
  }
}
