"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import NextImage from "next/image";

const Editor = dynamic(() => import("@/components/Editor/Editor").then((mod) => ({ default: mod.Editor })), {
  ssr: false,
});
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { COVER_TITLE_MAX_CHARS, COVER_TITLE_MAX_WORDS, COVER_TITLE_MIN_WORDS } from "@/lib/autopilot/cover-title";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OutputData } from "@editorjs/editorjs";
import { slugify } from "@/lib/slug";
import { createPost, updatePost, syncPostTranslations } from "@/src/server/services/posts/mutations";
import { regeneratePostCoverAction } from "@/src/server/services/growth/actions";
import { ChevronDown, ChevronUp, Languages, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector/LanguageSelector";
import { TranslatePostDialog } from "@/components/TranslatePostDialog/TranslatePostDialog";
import { getLanguageByCode } from "@/lib/languages";
import { format } from "date-fns";
import { toast } from "sonner";
import { useConfirmLeave, useUnsavedChanges } from "@/components/UnsavedChanges/UnsavedChangesProvider";

interface PostFormProps {
  blogId: string;
  post?: {
    id: string;
    title: string;
    slug: string;
    content: OutputData;
    excerpt?: string | null;
    coverImage?: string | null;
    status: string;
    featured?: boolean | null;
    publishedAt?: Date | null;
    authorId?: string | null;
    coverTitle?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    ogImage?: string | null;
    ogTitle?: string | null;
    ogDescription?: string | null;
    canonicalUrl?: string | null;
    keywords?: string | null;
    language?: string | null;
    categories?: Array<{ categoryId: string }>;
    tags?: Array<{ tagId: string }>;
  };
  categories: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
  authors: Array<{ id: string; name: string }>;
  existingTranslations?: Array<{ id: string; language: string }>;
  /** Language of new posts: the blog's main language. */
  defaultLanguage?: string;
  initialScheduleAt?: string;
  /** The website published articles are copied to, and where this post's copy stands. */
  website?: { site: string; state: string | null; url: string | null; error: string | null } | null;
}

type PostStatus = "draft" | "scheduled" | "published";

/** Formats a date for a datetime-local input, in the browser's timezone. */
function toLocalInput(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function PostForm({ blogId, post, categories, tags, authors, existingTranslations = [], initialScheduleAt, defaultLanguage = "en", website = null }: PostFormProps) {
  const router = useRouter();
  const isEditing = !!post;

  const [title, setTitle] = useState(post?.title || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [content, setContent] = useState<OutputData>(post?.content || { blocks: [] });
  const [excerpt, setExcerpt] = useState(post?.excerpt || "");
  const [coverImage, setCoverImage] = useState(post?.coverImage || "");
  const [status, setStatus] = useState<PostStatus>(
    (post?.status as PostStatus) || (initialScheduleAt ? "scheduled" : "draft")
  );
  const [featured, setFeatured] = useState(post?.featured ?? false);
  const [publishedAt, setPublishedAt] = useState(() =>
    toLocalInput(post?.publishedAt ? new Date(post.publishedAt) : initialScheduleAt ? new Date(initialScheduleAt) : new Date())
  );
  const [coverTitle, setCoverTitle] = useState(post?.coverTitle || "");
  const [metaTitle, setMetaTitle] = useState(post?.metaTitle || "");
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription || "");
  const [ogImage, setOgImage] = useState(post?.ogImage || "");
  const [ogTitle, setOgTitle] = useState(post?.ogTitle || "");
  const [ogDescription, setOgDescription] = useState(post?.ogDescription || "");
  const [canonicalUrl, setCanonicalUrl] = useState(post?.canonicalUrl || "");
  const [keywords, setKeywords] = useState(post?.keywords || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    post?.categories?.map((c) => c.categoryId) || []
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    post?.tags?.map((t) => t.tagId) || []
  );
  const [authorId, setAuthorId] = useState(post?.authorId || "");
  const [language, setLanguage] = useState(post?.language || defaultLanguage);

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoSlug, setAutoSlug] = useState(!post?.slug);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [drawingCover, setDrawingCover] = useState(false);

  /** Draws the cover with the autopilot's thumbnail settings; the article is updated on the server too. */
  async function handleGenerateCover() {
    if (!post) return;
    const hadCover = !!coverImage;
    setDrawingCover(true);
    try {
      const result = await regeneratePostCoverAction(blogId, post.id);
      if (!("url" in result)) { toast.error(result.error); return; }
      setCoverImage(result.url);
      if (result.coverTitle && !coverTitle.trim()) setCoverTitle(result.coverTitle);
      toast.success(hadCover ? "Thumbnail regenerated" : "Thumbnail generated");
    } finally {
      setDrawingCover(false);
    }
  }

  async function handleCoverImageUpload(file: File) {
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('blogId', blogId);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setCoverImage(data.file.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingCover(false);
    }
  }

  // Compute derived values
  const computedSlug = autoSlug && title ? slugify(title) : slug;
  const computedMetaTitle = metaTitle || title;
  const computedMetaDescription = metaDescription || excerpt;
  const computedOgTitle = ogTitle || computedMetaTitle;
  const computedOgDescription = ogDescription || computedMetaDescription;
  const computedOgImage = ogImage || coverImage;
  const fieldClass = "h-9 min-w-0 flex-1 border-0 bg-muted/40 px-3 shadow-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-0 dark:bg-muted/40 dark:hover:bg-muted/60 dark:focus-visible:bg-muted/60";
  const textAreaClass = "min-w-0 flex-1 resize-none border-0 bg-muted/40 px-3 py-2 shadow-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-0 dark:bg-muted/40 dark:hover:bg-muted/60 dark:focus-visible:bg-muted/60";

  const confirmLeave = useConfirmLeave();
  const { markSaved } = useUnsavedChanges({
    save: () => persist({ navigate: false }),
    value: {
      title, slug: computedSlug, blocks: content.blocks, excerpt, coverImage, status, featured, publishedAt, authorId, language,
      coverTitle, metaTitle, metaDescription, ogImage, ogTitle, ogDescription, canonicalUrl, keywords, selectedCategories, selectedTags,
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await persist({ navigate: true });
  }

  /** Saves the post; after a save from the form it goes back to the posts list. */
  async function persist({ navigate }: { navigate: boolean }) {
    setError("");
    if (status === "scheduled" && (!publishedAt || new Date(publishedAt) <= new Date())) {
      setError("Pick a future date and time to schedule this post.");
      toast.error("Pick a future date and time to schedule this post.");
      return false;
    }
    setIsLoading(true);

    const postData = {
      title,
      slug: computedSlug || slugify(title),
      content,
      excerpt: excerpt || undefined,
      coverImage: coverImage || undefined,
      status,
      featured,
      publishedAt: publishedAt ? new Date(publishedAt) : undefined,
      authorId: authorId || undefined,
      language: language || "en",
      coverTitle: coverTitle.trim() || undefined,
      metaTitle: computedMetaTitle || undefined,
      metaDescription: computedMetaDescription || undefined,
      ogImage: computedOgImage || undefined,
      ogTitle: computedOgTitle || undefined,
      ogDescription: computedOgDescription || undefined,
      canonicalUrl: canonicalUrl || undefined,
      keywords: keywords || undefined,
      categoryIds: selectedCategories.length > 0 ? selectedCategories : undefined,
      tagIds: selectedTags.length > 0 ? selectedTags : undefined,
    };

    const result = isEditing
      ? await updatePost(post.id, postData)
      : await createPost({ ...postData, blogId });

    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      setIsLoading(false);
      return false;
    } else {
      markSaved();
      toast.success(
        status === "published" ? (website ? `Post published · sending to ${website.site}` : "Post published")
          : status === "scheduled" ? "Post scheduled"
            : isEditing ? "Post saved" : "Draft created",
      );
      if (navigate) router.push(`/dashboard/blogs/${blogId}`);
      else setIsLoading(false);
      router.refresh();
      return true;
    }
  }

  async function handleSync() {
    if (!post?.id) return;
    setIsSyncing(true);
    try {
      const result = await syncPostTranslations(post.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.syncedCount || 0;
      const total = result.totalCount || 0;
      if (count === total) {
        toast.success(`${count} translation${count !== 1 ? "s" : ""} synced`);
      } else {
        toast.warning(`Synced ${count} of ${total} translation${total !== 1 ? "s" : ""}`, { description: result.warnings || undefined });
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to sync translations");
    } finally {
      setIsSyncing(false);
    }
  }


  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setTranslateDialogOpen(true)}
            >
              <Languages className="mr-2 h-4 w-4" />
              Translate
            </Button>
          )}
          {isEditing && existingTranslations && existingTranslations.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing || isLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sync
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={() => confirmLeave(() => router.push(`/dashboard/blogs/${blogId}`))}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isSyncing}>
              {status === "scheduled" ? "Schedule" : isEditing ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Cover image - thumbnail grande */}
        {coverImage ? (
          <div className="group relative w-full">
            <div className="relative w-full overflow-hidden rounded-lg border bg-muted">
              <NextImage 
                src={coverImage} 
                alt="Cover" 
                width={1200} 
                height={630} 
                className="w-full h-auto object-cover max-h-96" 
              />
              {drawingCover && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground backdrop-blur-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating thumbnail…
                </div>
              )}
              <div className={`absolute right-3 top-3 flex items-center gap-2 transition-opacity ${drawingCover ? "hidden" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleGenerateCover}
                    className="flex h-8 items-center gap-1.5 rounded-full bg-background/90 px-3 text-xs font-medium text-foreground shadow-sm backdrop-blur hover:bg-background"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Regenerate thumbnail
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCoverImage("")}
                  aria-label="Remove cover image"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="file"
              id="cover-upload"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCoverImageUpload(file);
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById('cover-upload')?.click()}
              disabled={uploadingCover}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {uploadingCover ? (
                <>
                  <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  Upload cover image
                </>
              )}
            </button>
            <span className="text-muted-foreground">or</span>
            <button
              type="button"
              onClick={() => {
                const url = prompt("Enter image URL:");
                if (url) setCoverImage(url);
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              paste URL
            </button>
            {isEditing && (
              <>
                <span className="text-muted-foreground">or</span>
                <button
                  type="button"
                  onClick={handleGenerateCover}
                  disabled={drawingCover}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {drawingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {drawingCover ? "Generating..." : "generate with AI"}
                </button>
              </>
            )}
          </div>
        )}

        <div className="editor-content-rail space-y-6">
          {/* Título más pequeño y con wrap */}
          <textarea
            placeholder="Post title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            rows={1}
            onInput={(e) => {
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
            }}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }
            }}
            className="w-full resize-none overflow-hidden border-0 bg-transparent px-0 text-3xl font-bold outline-none placeholder:text-muted-foreground/30"
          />

          {/* Campos principales en grid compacto */}
          <div className="space-y-3 text-sm">
          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">Slug</Label>
            <Input
              value={autoSlug ? computedSlug : slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setAutoSlug(false);
              }}
              placeholder="a-great-title"
              className={fieldClass}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">Author</Label>
            <Select value={authorId || "none"} onValueChange={(value) => setAuthorId(value === "none" ? "" : value)}>
              <SelectTrigger className={fieldClass}>
                <SelectValue placeholder="Select an author" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No author</SelectItem>
                {authors.map((author) => (
                  <SelectItem key={author.id} value={author.id}>
                    {author.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">Language</Label>
            <LanguageSelector
              value={language}
              onValueChange={setLanguage}
              required
              className="min-w-0 flex-1"
            />
          </div>

          {/* Sección de traducciones existentes */}
          {isEditing && existingTranslations.length > 0 && (
            <div className="flex items-start gap-4">
              <Label className="text-muted-foreground w-[120px] shrink-0 pt-2">Translations</Label>
              <div className="flex flex-wrap gap-2 flex-1">
                {existingTranslations.map((translation) => {
                  const lang = getLanguageByCode(translation.language);
                  return (
                    <button
                      key={translation.id}
                      type="button"
                      onClick={() => confirmLeave(() => router.push(`/dashboard/blogs/${blogId}/posts/${translation.id}/edit`))}
                      className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {lang?.name || translation.language}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as PostStatus)}
            >
              <SelectTrigger className={fieldClass}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {website && (
            <div className="flex items-center gap-4">
              <Label className="text-muted-foreground w-[120px] shrink-0">Website</Label>
              <p className="min-w-0 flex-1 truncate px-3 text-sm text-muted-foreground">
                {post?.status === "published" && website.state === "synced" && website.url ? (
                  <a href={website.url} target="_blank" rel="noopener noreferrer" className="text-foreground underline-offset-4 hover:underline">View on {website.site} ↗</a>
                ) : post?.status === "published" && website.state === "failed" ? (
                  <Link href={`/dashboard/blogs/${blogId}/settings/web-integration`} className="text-destructive underline-offset-4 hover:underline" title={website.error ?? undefined}>Couldn’t copy it to {website.site}</Link>
                ) : status === "published" || status === "scheduled" ? (
                  `Copied to ${website.site} when it’s published`
                ) : (
                  `Drafts stay in Zenex; publishing copies it to ${website.site}`
                )}
              </p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">
              {status === "scheduled" ? "Publish on" : "Published at"}
            </Label>
            <Input
              type="datetime-local"
              value={publishedAt}
              min={status === "scheduled" ? toLocalInput(new Date()) : undefined}
              onChange={(e) => setPublishedAt(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="flex items-start gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0 pt-2">Excerpt</Label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="A short description of your post. Recommended to be 155 characters or less."
              rows={2}
              className={textAreaClass}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">Category</Label>
            <Select
              value={selectedCategories[0] || ""}
              onValueChange={(value) => setSelectedCategories([value])}
            >
              <SelectTrigger className={fieldClass}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4">
            <Label className="text-muted-foreground w-[120px] shrink-0">Tags</Label>
            <Select
              value={selectedTags[0] || ""}
              onValueChange={(value) => {
                if (!selectedTags.includes(value)) {
                  setSelectedTags([...selectedTags, value]);
                }
              }}
            >
              <SelectTrigger className={fieldClass}>
                <SelectValue placeholder="Select some tags" />
              </SelectTrigger>
              <SelectContent>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Botón para mostrar propiedades avanzadas */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAdvanced ? "Hide" : "Show"} properties
          </button>

          {/* Propiedades avanzadas colapsables */}
          {showAdvanced && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-4">
                <Label htmlFor="featured" className="text-muted-foreground w-[120px] shrink-0">Featured</Label>
                <Checkbox
                  id="featured"
                  checked={featured}
                  onCheckedChange={(checked) => setFeatured(checked === true)}
                />
              </div>

              <div className="flex items-start gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0 pt-2">Cover Headline</Label>
                <div className="flex-1 space-y-1">
                  <Input
                    value={coverTitle}
                    onChange={(e) => setCoverTitle(e.target.value.slice(0, COVER_TITLE_MAX_CHARS))}
                    placeholder={title || "A few words for the thumbnail"}
                    className={fieldClass}
                  />
                  <p className="text-muted-foreground text-xs">
                    Drawn on the generated thumbnail. {COVER_TITLE_MIN_WORDS}–{COVER_TITLE_MAX_WORDS} words read best; the
                    article title is used when this is empty.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0">Meta Title</Label>
                <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={computedMetaTitle} className={fieldClass} />
              </div>

              <div className="flex items-start gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0 pt-2">Meta Description</Label>
                <Textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder={computedMetaDescription}
                  rows={2}
                  className={textAreaClass}
                />
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0">OG Image</Label>
                <Input
                  type="url"
                  value={ogImage}
                  onChange={(e) => setOgImage(e.target.value)}
                  placeholder="Open Graph image URL"
                  className={fieldClass}
                />
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0">OG Title</Label>
                <Input value={ogTitle} onChange={(e) => setOgTitle(e.target.value)} placeholder={computedOgTitle} className={fieldClass} />
              </div>

              <div className="flex items-start gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0 pt-2">OG Description</Label>
                <Textarea
                  value={ogDescription}
                  onChange={(e) => setOgDescription(e.target.value)}
                  placeholder={computedOgDescription}
                  rows={2}
                  className={textAreaClass}
                />
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0">Canonical URL</Label>
                <Input
                  type="url"
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  className={fieldClass}
                />
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-muted-foreground w-[120px] shrink-0">Keywords</Label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="Comma-separated keywords"
                  className={fieldClass}
                />
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Editor de contenido */}
        <div className="pt-6">
          <Editor data={content} onChange={setContent} blogId={blogId} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {isEditing && post && (
        <TranslatePostDialog
          open={translateDialogOpen}
          onOpenChange={setTranslateDialogOpen}
          postId={post.id}
          currentLanguage={language}
          existingLanguages={existingTranslations.map((t) => t.language)}
          blogId={blogId}
        />
      )}
    </form>
  );
}
