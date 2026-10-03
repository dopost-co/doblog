import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { convertBlocksToHtml } from "@/lib/editorjs-to-html";
import { getLanguageName } from "@/lib/languages";

const ARTICLE_STYLES = [
  "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold",
  "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold",
  "[&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:font-semibold",
  "[&_p]:my-4 [&_p]:leading-7",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
  "[&_a]:underline [&_a]:underline-offset-4",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:italic",
  "[&_img]:my-6 [&_img]:rounded-lg [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_code]:text-sm",
  "[&_table]:my-6 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2",
].join(" ");

/** What viewers see instead of the editor: the article as it reads, with no way to change it. */
export function PostReadOnly({ blogId, post }: {
  blogId: string;
  post: { title: string; excerpt: string | null; coverImage: string | null; content: unknown; status: string; language: string; publishedAt: Date | null };
}) {
  const date = post.publishedAt?.toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/dashboard/blogs/${blogId}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />Posts
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
          <Eye className="size-3.5" />View only
        </span>
      </div>
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {post.status}{date ? ` · ${date}` : ""} · {getLanguageName(post.language) ?? post.language}
        </p>
        <h1 className="text-4xl font-bold tracking-tight">{post.title}</h1>
        {post.excerpt && <p className="text-lg text-muted-foreground">{post.excerpt}</p>}
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element -- blog media is already sized and hosted on the blog's storage */}
      {post.coverImage && <img src={post.coverImage} alt="" className="w-full rounded-xl border bg-muted object-cover" />}
      {/* convertBlocksToHtml sanitizes its output. */}
      <div className={ARTICLE_STYLES} dangerouslySetInnerHTML={{ __html: convertBlocksToHtml(post.content) }} />
    </article>
  );
}
