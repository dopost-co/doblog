import { redirect } from "next/navigation";
import { getBlogById } from "@/src/server/services/blogs/queries";
import { getBlogAccess } from "@/src/server/services/blogs/access";
import { getCategoriesByBlogId } from "@/src/server/services/categories/queries";
import { getTagsByBlogId } from "@/src/server/services/tags/queries";
import { getAuthorsByBlogId } from "@/src/server/services/authors/queries";
import { PostForm } from "@/components/PostForm/PostForm";

export default async function NewPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scheduleAt?: string }>;
}) {
  const { id } = await params;
  const { scheduleAt } = await searchParams;
  const initialScheduleAt = scheduleAt && !Number.isNaN(Date.parse(scheduleAt)) ? scheduleAt : undefined;
  const blog = await getBlogById(id);

  if (!blog) {
    redirect("/dashboard");
  }

  const access = await getBlogAccess(id);

  if (!access) {
    redirect("/dashboard");
  }
  if (!access.can("content.write")) {
    redirect(`/dashboard/blogs/${id}`);
  }

  const [categories, tags, authors] = await Promise.all([
    getCategoriesByBlogId(id),
    getTagsByBlogId(id),
    getAuthorsByBlogId(id),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[800px] px-6 py-12">
        <PostForm blogId={id} categories={categories} tags={tags} authors={authors} initialScheduleAt={initialScheduleAt} defaultLanguage={blog.languages[0]} />
      </main>
    </div>
  );
}

