import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { isBlogRole, type BlogRole } from "@/lib/permissions";

export interface BlogMemberWithUser {
  id: string;
  userEmail: string;
  role: BlogRole;
  createdAt: Date;
  user?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

/**
 * Get all members of a blog (including owner)
 */
export async function getBlogMembers(blogId: string): Promise<{
  error?: string;
  members?: BlogMemberWithUser[];
  ownerEmail?: string;
  ownerUser?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}> {
  const session = await getSession();
  if (!session?.user?.id || !session?.user?.email) {
    return { error: "Unauthorized" };
  }

  try {
    // Get blog to verify access and get owner email
    const blog = await prisma.blog.findFirst({
      where: { id: blogId, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!blog) {
      return { error: "Blog not found" };
    }

    // Check if user has access (owner or member)
    const isOwner = blog.userId === session.user.id;
    const normalizedEmail = session.user.email.toLowerCase().trim();
    const isMember = await prisma.blogMember.findFirst({
      where: {
        blogId,
        userEmail: normalizedEmail,
      },
    });

    if (!isOwner && !isMember) {
      return { error: "Unauthorized" };
    }

    // Get all members
    const members = await prisma.blogMember.findMany({
      where: { blogId },
      orderBy: {
        createdAt: "asc",
      },
    });

    const users = await prisma.user.findMany({
      where: { email: { in: members.map((member) => member.userEmail) } },
      select: { id: true, email: true, name: true },
    });
    const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
    const membersWithUser: BlogMemberWithUser[] = members.map((member) => ({
      id: member.id,
      userEmail: member.userEmail,
      role: isBlogRole(member.role) ? member.role : "viewer",
      createdAt: member.createdAt,
      user: usersByEmail.get(member.userEmail.toLowerCase()) || null,
    }));

    return {
      members: membersWithUser,
      ownerEmail: blog.user.email,
      ownerUser: blog.user,
    };
  } catch (error) {
    console.error("Error fetching blog members:", error);
    return { error: "Failed to fetch blog members" };
  }
}
