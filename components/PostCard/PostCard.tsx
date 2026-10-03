"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2, MoreHorizontal, Sparkles, Star, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TranslatePostDialog } from "@/components/TranslatePostDialog/TranslatePostDialog";
import { getLanguageName } from "@/lib/languages";
import { deletePost, updatePost } from "@/src/server/services/posts/mutations";
import { regeneratePostCoverAction } from "@/src/server/services/growth/actions";
import { toast } from "sonner";

interface PostCardProps {
  id: string;
  blogId: string;
  title: string;
  publishedAt: Date | null;
  status: string;
  featured: boolean;
  coverImage?: string | null;
  language?: string | null;
  availableLanguages?: string[];
  categories: Array<{ id: string; name: string }>;
  author?: { id: string; name: string } | null;
  /** Viewers open the post but get no publish, delete or translate actions. */
  canEdit?: boolean;
}

export function PostCard({
  id,
  blogId,
  title,
  publishedAt,
  status,
  featured,
  coverImage,
  language,
  availableLanguages = [],
  categories,
  author,
  canEdit = true,
}: PostCardProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [isFeatured, setIsFeatured] = useState(featured);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [cover, setCover] = useState(coverImage);
  const [drawingCover, setDrawingCover] = useState(false);

  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(currentStatus === "scheduled" ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : null;
  const statusBadge = {
    published: { label: "Published", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    scheduled: { label: "Scheduled", className: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  }[currentStatus] ?? { label: "Draft", className: "bg-muted text-muted-foreground" };

  async function patchPost(data: { status?: "draft" | "published"; featured?: boolean }) {
    setIsUpdating(true);
    const result = await updatePost(id, data);
    setIsUpdating(false);
    if (result.error) { toast.error(result.error); return false; }
    router.refresh();
    return true;
  }

  async function setStatus(next: "draft" | "published") {
    const wasScheduled = currentStatus === "scheduled";
    if (await patchPost({ status: next })) {
      setCurrentStatus(next);
      toast.success(next === "published" ? "Post published" : wasScheduled ? "Post unscheduled" : "Moved to draft");
    }
  }

  async function toggleFeatured(next: boolean) {
    if (await patchPost({ featured: next })) {
      setIsFeatured(next);
      toast.success(next ? "Marked as featured" : "Removed from featured");
    }
  }

  async function regenerateCover() {
    setDrawingCover(true);
    const result = await regeneratePostCoverAction(blogId, id);
    setDrawingCover(false);
    if (!("url" in result)) { toast.error(result.error); return; }
    setCover(result.url);
    toast.success(cover ? "Thumbnail regenerated" : "Thumbnail generated");
    router.refresh();
  }

  async function handleDelete() {
    setIsUpdating(true);
    setDeleteError("");
    const result = await deletePost(id);
    if (result.error) {
      setDeleteError(result.error);
      setIsUpdating(false);
      return;
    }
    setDeleteOpen(false);
    toast.success("Post deleted");
    router.refresh();
  }

  const chipClass = "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground";
  const displayedLanguages = availableLanguages.length > 0
    ? Array.from(new Set(availableLanguages))
    : language ? [language] : [];

  return (
    <>
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="flex items-center gap-4 px-4 py-3">
          <Link href={`/dashboard/blogs/${blogId}/posts/${id}/edit`} className="flex min-w-0 flex-1 items-center gap-4">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
              {drawingCover && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Generating thumbnail" />
                </div>
              )}
              {cover ? (
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
                  <span className="text-lg font-medium">{title.slice(0, 1).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-semibold">{title}</h3>
                {isFeatured && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-amber-500" aria-label="Featured" />}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {formattedDate && <span className="text-xs text-muted-foreground">{formattedDate}</span>}
                {displayedLanguages.map((lang) => (
                  <span
                    key={lang}
                    className={lang === language
                      ? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                      : chipClass}
                  >
                    {getLanguageName(lang) || lang}
                  </span>
                ))}
                {categories.map((category) => <span key={category.id} className={chipClass}>{category.name}</span>)}
                {author && <span className={chipClass}>{author.name}</span>}
              </div>
            </div>
          </Link>

          <span className={`hidden rounded-full px-2 py-1 text-xs sm:inline-flex ${statusBadge.className}`}>
            {statusBadge.label}
          </span>

          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${title}`} disabled={isUpdating}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {currentStatus !== "published" && (
                  <DropdownMenuItem onSelect={() => setStatus("published")}>
                    <Check />
                    {currentStatus === "scheduled" ? "Publish now" : "Publish"}
                  </DropdownMenuItem>
                )}
                {currentStatus !== "draft" && (
                  <DropdownMenuItem onSelect={() => setStatus("draft")}>
                    <Undo2 />
                    {currentStatus === "scheduled" ? "Unschedule" : "Move to draft"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem role="menuitemcheckbox" aria-checked={isFeatured} onSelect={() => toggleFeatured(!isFeatured)}>
                  <Star className={cn(isFeatured && "fill-amber-400 text-amber-500")} />
                  Featured
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={regenerateCover} disabled={drawingCover}>
                  <Sparkles /> {cover ? "Regenerate thumbnail" : "Generate thumbnail"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTranslateOpen(true)}>
                  <Languages /> Translate to…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      </Card>

      <TranslatePostDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        postId={id}
        currentLanguage={language || "en"}
        existingLanguages={availableLanguages}
        blogId={blogId}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
            <DialogDescription>This permanently deletes “{title}”. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isUpdating}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isUpdating}>
              {isUpdating ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
