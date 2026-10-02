"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { normalizeBlogLanguages } from "@/lib/blog-languages";
import { syncSeoLanguage } from "@/src/server/services/seo/service";

const createBlogSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
});

const updateBlogSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function createBlog(data: {
  name: string;
  slug: string;
  description?: string;
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  try {
    const validated = createBlogSchema.parse(data);

    // Check if slug already exists for this user
    const existingBlog = await prisma.blog.findFirst({
      where: {
        userId: session.user.id,
        slug: validated.slug,
        deletedAt: null,
      },
    });

    if (existingBlog) {
      return { error: "Blog with this slug already exists" };
    }

    const blog = await prisma.blog.create({
      data: {
        ...validated,
        userId: session.user.id,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, blog };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Failed to create blog" };
  }
}

export async function updateBlog(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
  }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  try {
    const validated = updateBlogSchema.partial().parse(data);

    // Check ownership (only owner can update blog)
    const blog = await prisma.blog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!blog) {
      return { error: "Blog not found" };
    }

    if (blog.userId !== session.user.id) {
      return { error: "Unauthorized: Only the blog owner can update the blog" };
    }

    // Check slug uniqueness if updating slug
    if (validated.slug && validated.slug !== blog.slug) {
      const existingBlog = await prisma.blog.findFirst({
        where: {
          userId: session.user.id,
          slug: validated.slug,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existingBlog) {
        return { error: "Blog with this slug already exists" };
      }
    }

    const updatedBlog = await prisma.blog.update({
      where: { id },
      data: validated,
    });

    revalidatePath(`/dashboard/blogs/${id}`);
    revalidatePath(`/dashboard/blogs/${id}/settings`);
    revalidatePath("/dashboard");
    return { success: true, blog: updatedBlog };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message };
    }
    return { error: "Failed to update blog" };
  }
}

/**
 * Languages the blog is written in (the first is the main one, which Autopilot
 * writes in) and whether translation groups stay in sync automatically.
 */
export async function updateBlogLanguages(id: string, data: { languages: string[]; autoSyncTranslations: boolean }) {
  const session = await getSession();
  if (!session?.user?.id) return { error: "Unauthorized" };

  let languages: string[];
  try { languages = normalizeBlogLanguages(data.languages); } catch (error) {
    return { error: error instanceof Error ? error.message : "Choose the blog languages" };
  }

  const blog = await prisma.blog.findFirst({ where: { id, deletedAt: null }, select: { userId: true, languages: true } });
  if (!blog) return { error: "Blog not found" };
  if (blog.userId !== session.user.id) return { error: "Only the blog owner can change its languages" };

  const autoSyncTranslations = languages.length > 1 && data.autoSyncTranslations;
  await prisma.blog.update({ where: { id }, data: { languages, autoSyncTranslations } });
  if (blog.languages[0] !== languages[0]) {
    await syncSeoLanguage(id, languages[0]);
  }

  revalidatePath(`/dashboard/blogs/${id}`, "layout");
  return { success: true, languages, autoSyncTranslations };
}

export async function deleteBlog(id: string, confirmationName: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  try {
    const blog = await prisma.blog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!blog) {
      return { error: "Blog not found" };
    }

    // Only owner can delete blog
    if (blog.userId !== session.user.id) {
      return { error: "Unauthorized: Only the blog owner can delete the blog" };
    }

    if (confirmationName !== blog.name) {
      return { error: "Enter the blog name exactly as shown" };
    }

    await prisma.blog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    updateTag(`blog-${blog.blogId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch {
    return { error: "Failed to delete blog" };
  }
}
