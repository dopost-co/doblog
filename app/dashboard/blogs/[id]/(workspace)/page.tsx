import { redirect } from "next/navigation";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getPostsByBlogId, getAvailableLanguagesByTranslationGroupIds } from "@/src/server/services/posts/queries";
import { PageHeader } from "@/components/PageHeader/PageHeader";
import { PostCard } from "@/components/PostCard/PostCard";
import { Button } from "@/components/ui/button";
import { GroupTranslationsToggle } from "@/components/GroupTranslationsToggle/GroupTranslationsToggle";
import Link from "next/link";
import { Plus } from "lucide-react";

/** Regenerating a cover with AI runs as a server action on this page. */
export const maxDuration = 300;
export default async function BlogPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; page?: string; groupTranslations?: string }>;
}) {
  const { id } = await params;
  const { status, page: pageParam, groupTranslations: groupTranslationsParam } = await searchParams;
  const blog = await getBlogById(id);

  if (!blog) {
    redirect("/dashboard");
  }

  const access = await getBlogAccess(id);

  if (!access) {
    redirect("/dashboard");
  }

  const currentPage = pageParam ? parseInt(pageParam, 10) : 1;
  const groupTranslations = groupTranslationsParam !== "false";

  const { posts, pagination } = await getPostsByBlogId(id, {
    status: status || undefined,
    page: currentPage,
    limit: 20,
    includeContent: false,
    groupTranslations,
  });
  const languagesByGroup = await getAvailableLanguagesByTranslationGroupIds(
    posts.flatMap((post) => post.translationGroupId ? [post.translationGroupId] : [])
  );
  const pageHref = (pageNumber: number) => {
    const query = new URLSearchParams({ page: String(pageNumber) });
    if (status) query.set("status", status);
    if (!groupTranslations) query.set("groupTranslations", "false");
    return `/dashboard/blogs/${id}?${query.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
        <PageHeader
          title="Posts"
          actions={
            <>
              <GroupTranslationsToggle enabled={groupTranslations} />
              {access.can("content.write") && (
                <Button asChild>
                  <Link href={`/dashboard/blogs/${id}/posts/new`}>
                    <Plus />
                    New post
                  </Link>
                </Button>
              )}
            </>
          }
        />
        <div className="flex flex-col gap-3">
          {posts.map((post) => {
              const availableLanguages = post.translationGroupId
                ? languagesByGroup[post.translationGroupId] || [post.language]
                : [post.language];
              return (
                <PostCard
                  key={post.id}
                  id={post.id}
                  blogId={id}
                  title={post.title}
                  publishedAt={post.publishedAt}
                  status={post.status}
                  coverImage={post.coverImage}
                  language={post.language}
                  availableLanguages={availableLanguages}
                  categories={post.categories.map(({ category }) => ({ id: category.id, name: category.name }))}
                  author={post.author ? { id: post.author.id, name: post.author.name } : null}
                  featured={post.featured}
                  canEdit={access.can("content.write")}
                />
              );
            })}
        </div>
        {posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">No posts yet. Create your first post to get started.</p>
          </div>
        )}
        {pagination.totalPages > 0 && (
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm text-muted-foreground">
              {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </div>
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Link
                  href={pageHref(pagination.page - 1)}
                  className={pagination.page === 1 ? "pointer-events-none" : ""}
                >
                  <Button variant="ghost" size="sm" disabled={pagination.page === 1} className="h-8 w-8 p-0">
                    ←
                  </Button>
                </Link>
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (pagination.page <= 3) {
                    pageNum = i + 1;
                  } else if (pagination.page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = pagination.page - 2 + i;
                  }
                  return (
                    <Link key={pageNum} href={pageHref(pageNum)}>
                      <Button
                        variant={pagination.page === pageNum ? "default" : "ghost"}
                        size="sm"
                        className="h-8 w-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    </Link>
                  );
                })}
                <Link
                  href={pageHref(pagination.page + 1)}
                  className={pagination.page === pagination.totalPages ? "pointer-events-none" : ""}
                >
                  <Button variant="ghost" size="sm" disabled={pagination.page === pagination.totalPages} className="h-8 w-8 p-0">
                    →
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
