"use server";

import type { Prisma, Post } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import { revalidatePath, updateTag } from "next/cache";
import type { OutputData } from "@editorjs/editorjs";
import { TranslationService } from "@/src/server/services/translations/TranslationService";
import { userHasAccessToBlog } from "@/src/server/services/blogs/members/mutations";
import { dashboardOperation, recordBlogId } from "@/src/server/services/content/dashboard";
import { ApiError, apiError } from "@/lib/integrations/errors";
import { createPostTranslation } from "@/src/server/services/translations/post-translation";
import { resolveOpenAiAccess } from "@/src/server/services/providers/credentials";
import type { PostStatus } from "@/lib/integrations/schemas";

export async function createPost(data: {
  blogId: string;
  title: string;
  slug: string;
  content: OutputData;
  excerpt?: string;
  coverImage?: string;
  status?: PostStatus;
  featured?: boolean;
  publishedAt?: Date;
  authorId?: string;
  language: string;
  coverTitle?: string;
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonicalUrl?: string;
  keywords?: string;
  categoryIds?: string[];
  tagIds?: string[];
}) {
  try {
    const { blogId, publishedAt, ...fields } = data;
    const post = await dashboardOperation(blogId, "create_posts", {
      ...fields, ...(publishedAt ? { publishedAt: publishedAt.toISOString() } : {}),
    }) as Post;
    return { success: true, post };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function updatePost(
  id: string,
  data: {
    // Older dashboard forms send this; ownership always comes from the post.
    blogId?: string;
    title?: string;
    slug?: string;
    content?: OutputData;
    excerpt?: string;
    coverImage?: string;
    status?: PostStatus;
    featured?: boolean;
    publishedAt?: Date;
    authorId?: string;
    language?: string;
    coverTitle?: string;
    metaTitle?: string;
    metaDescription?: string;
    ogImage?: string;
    ogTitle?: string;
    ogDescription?: string;
    canonicalUrl?: string;
    keywords?: string;
    categoryIds?: string[];
    tagIds?: string[];
  }
) {
  try {
    const blogId = await recordBlogId("posts", id);
    const { publishedAt, ...fields } = data;
    delete fields.blogId;
    const post = await dashboardOperation(blogId, "update_posts", {
      ...fields, id, ...(publishedAt ? { publishedAt: publishedAt.toISOString() } : {}),
    }) as Post;
    return { success: true, post };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function deletePost(id: string) {
  try {
    await dashboardOperation(await recordBlogId("posts", id), "delete_posts", { id });
    return { success: true };
  } catch (error) { return { error: apiError(error).error }; }
}

export async function translatePost(postId: string, targetLanguage: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  try {
    const source = await prisma.post.findUnique({ where: { id: postId }, select: { blogId: true } });
    if (!source) return { error: "Post not found" };
    const hasAccess = await userHasAccessToBlog(session.user.id, session.user.email || "", source.blogId);
    if (!hasAccess) return { error: "Unauthorized" };

    const post = await createPostTranslation(source.blogId, postId, targetLanguage);
    updateTag(`blog-${source.blogId}-posts`);
    revalidatePath(`/dashboard/blogs/${source.blogId}`);
    return { success: true, post };
  } catch (error) {
    console.error("Error translating post:", error);
    return { error: error instanceof ApiError ? error.message : "Failed to translate post" };
  }
}

export async function syncPostTranslations(postId: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Unauthorized" };
  }

  try {
    // Get the current post with all its data
    const currentPost = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        blog: true,
        categories: {
          include: {
            category: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (!currentPost) {
      return { error: "Post not found" };
    }

    const hasAccess = await userHasAccessToBlog(
      session.user.id,
      session.user.email || "",
      currentPost.blogId
    );

    if (!hasAccess) {
      return { error: "Unauthorized" };
    }

    // Check if post has a translation group
    if (!currentPost.translationGroupId) {
      return { error: "This post does not have any translations to sync" };
    }

    // Get all translations of the same group (excluding current post)
    const translations = await prisma.post.findMany({
      where: {
        translationGroupId: currentPost.translationGroupId,
        id: { not: postId },
      },
      include: {
        categories: {
          include: {
            category: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    });

    if (translations.length === 0) {
      return { error: "No translations found to sync" };
    }

    // Uses the blog owner's AI key (or the platform's for subscribers).
    const translationService = new TranslationService(await resolveOpenAiAccess(currentPost.blog.userId), currentPost.blogId);

    // Sync each translation (with error handling per translation)
    const syncResults = await Promise.allSettled(
      translations.map(async (translation) => {
        try {
          // Translate the content from current post to the translation's language
          const translatedContent = await translationService.translatePostContent(
            currentPost.content as unknown as OutputData,
            translation.language,
            currentPost.language
          );

          // Get current categories and tags IDs
          const currentCategoryIds = currentPost.categories.map((c) => c.categoryId);
          const currentTagIds = currentPost.tags.map((t) => t.tagId);

          // Get translation's current categories and tags IDs
          const translationCategoryIds = translation.categories.map((c) => c.categoryId);
          const translationTagIds = translation.tags.map((t) => t.tagId);

          // Determine which categories and tags to sync
          const categoriesToAdd = currentCategoryIds.filter(
            (id) => !translationCategoryIds.includes(id)
          );
          const categoriesToRemove = translationCategoryIds.filter(
            (id) => !currentCategoryIds.includes(id)
          );
          const tagsToAdd = currentTagIds.filter((id) => !translationTagIds.includes(id));
          const tagsToRemove = translationTagIds.filter((id) => !currentTagIds.includes(id));

          // Update the translation
          const updatedPost = await prisma.post.update({
            where: { id: translation.id },
            data: {
              content: translatedContent as unknown as Prisma.InputJsonValue,
              // Sync non-language-specific fields
              coverImage: currentPost.coverImage,
              ogImage: currentPost.ogImage,
              canonicalUrl: currentPost.canonicalUrl,
              status: currentPost.status,
              featured: currentPost.featured, // Sync featured status
              authorId: currentPost.authorId,
              publishedAt: currentPost.publishedAt,
              // Sync categories
              categories: {
                deleteMany: categoriesToRemove.map((categoryId) => ({
                  postId: translation.id,
                  categoryId,
                })),
                create: categoriesToAdd.map((categoryId) => ({
                  categoryId,
                })),
              },
              // Sync tags
              tags: {
                deleteMany: tagsToRemove.map((tagId) => ({
                  postId: translation.id,
                  tagId,
                })),
                create: tagsToAdd.map((tagId) => ({
                  tagId,
                })),
              },
            },
            include: {
              categories: {
                include: {
                  category: true,
                },
              },
              tags: {
                include: {
                  tag: true,
                },
              },
            },
          });

          return { success: true, post: updatedPost, language: translation.language };
        } catch (error) {
          console.error(`Error syncing translation to ${translation.language}:`, error);
          return {
            success: false,
            language: translation.language,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      })
    );

    // Separate successful and failed syncs
    const syncedPosts = syncResults
      .filter((result) => result.status === "fulfilled" && result.value.success)
      .map((result) => (result.status === "fulfilled" ? result.value.post : null))
      .filter(Boolean);

    const failedSyncs = syncResults
      .filter(
        (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.success)
      )
      .map((result) => {
        if (result.status === "rejected") {
          return { language: "unknown", error: result.reason?.message || "Unknown error" };
        }
        return result.value;
      });

    // If all syncs failed, return error
    if (syncedPosts.length === 0 && failedSyncs.length > 0) {
      const errorMessages = failedSyncs
        .map((f) => `${f.language}: ${f.error}`)
        .join("; ");
      return { error: `Failed to sync translations: ${errorMessages}` };
    }

    // If some syncs failed, include warning in response
    const warnings =
      failedSyncs.length > 0
        ? failedSyncs.map((f) => `Failed to sync ${f.language}: ${f.error}`).join("; ")
        : undefined;

    updateTag(`blog-${currentPost.blogId}-posts`);
    revalidatePath(`/dashboard/blogs/${currentPost.blogId}`);
    return {
      success: true,
      syncedCount: syncedPosts.length,
      totalCount: translations.length,
      posts: syncedPosts,
      warnings,
    };
  } catch (error) {
    console.error("Error syncing post translations:", error);
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to sync post translations" };
  }
}
