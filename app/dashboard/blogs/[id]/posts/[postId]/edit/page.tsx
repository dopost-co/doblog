import type { OutputData } from "@editorjs/editorjs";
import { redirect } from "next/navigation";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getPostById, getPostsByTranslationGroup } from "@/src/server/services/posts/queries";
import { getCategoriesByBlogId } from "@/src/server/services/categories/queries";
import { getTagsByBlogId } from "@/src/server/services/tags/queries";
import { getAuthorsByBlogId } from "@/src/server/services/authors/queries";
import { PostForm } from "@/components/PostForm/PostForm";
import { PostReadOnly } from "@/components/PostReadOnly/PostReadOnly";
import { getPublicationStates } from "@/src/server/services/publishing/queries";
import { destinationName } from "@/lib/publishing/platforms";

/** Regenerating a cover with AI runs as a server action on this page. */
export const maxDuration = 300;
export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const blog = await getBlogById(id);
  const post = await getPostById(postId);

  if (!blog) {
    redirect("/dashboard");
  }

  const access = await getBlogAccess(id);

  if (!access) {
    redirect("/dashboard");
  }

  if (!post || post.blogId !== id) {
    redirect(`/dashboard/blogs/${id}`);
  }

  if (!access.can("content.write")) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-[800px] px-6 py-12">
          <PostReadOnly blogId={id} post={post} />
        </main>
      </div>
    );
  }

  // Get existing translations if post has a translationGroupId
  const existingTranslations = post.translationGroupId
    ? await getPostsByTranslationGroup(post.translationGroupId)
    : [];

  // Filter out the current post from translations and map to the format needed
  const translations = existingTranslations
    .filter((t) => t.id !== post.id)
    .map((t) => ({
      id: t.id,
      language: t.language,
    }));

  const [categories, tags, authors, copies] = await Promise.all([
    getCategoriesByBlogId(id),
    getTagsByBlogId(id),
    getAuthorsByBlogId(id),
    getPublicationStates(id, [post.id]),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[800px] px-6 py-12">
        <PostForm
          blogId={id}
          website={copies.destination?.connected ? { site: destinationName(copies.destination), ...(copies.states[post.id] ?? { state: null, url: null, error: null }) } : null}
          post={{
            id: post.id,
            title: post.title,
            slug: post.slug,
            content: post.content as unknown as OutputData,
            excerpt: post.excerpt,
            coverImage: post.coverImage,
            status: post.status,
            featured: post.featured,
            publishedAt: post.publishedAt,
            authorId: post.authorId,
            metaTitle: post.metaTitle,
            metaDescription: post.metaDescription,
            ogImage: post.ogImage,
            ogTitle: post.ogTitle,
            ogDescription: post.ogDescription,
            canonicalUrl: post.canonicalUrl,
            keywords: post.keywords,
            language: post.language,
            categories: post.categories,
            tags: post.tags,
          }}
          categories={categories}
          tags={tags}
          authors={authors}
          existingTranslations={translations}
        />
      </main>
    </div>
  );
}
