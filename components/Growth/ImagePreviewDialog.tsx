"use client";

import { useEffect, useState, useTransition } from "react";
import { Eye, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { previewImageAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PreviewSettings = {
  format?: string;
  colors?: string[];
  typography?: Record<string, unknown>;
  style: string | null;
  referenceUrls: string[];
  logoUrl: string | null;
  logoPosition: string;
  size?: string;
};

/**
 * Tries the image settings on screen (saved or not) on an existing article.
 * The sample is shown here only and never stored.
 */
export function ImagePreviewDialog({ blogId, kind, posts, settings, usesAi }: {
  blogId: string;
  kind: "cover" | "inline";
  posts: { id: string; title: string }[];
  /** Read when generating, so the latest unsaved values are used. */
  settings: () => PreviewSettings;
  /** Whether a preview spends AI credits (brand cards without illustration do not). */
  usesAi: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [postId, setPostId] = useState(posts[0]?.id ?? "");
  const [image, setImage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Leaving the page would lose a preview that is still being made (and paid for).
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  function generate() {
    startTransition(async () => {
      const result = await previewImageAction(blogId, { kind, postId, ...settings() });
      if (!("success" in result)) { toast.error(result.error); return; }
      setImage(result.image);
      for (const warning of result.warnings) toast.warning(warning);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="justify-self-start"><Eye />Preview</Button>
      </DialogTrigger>
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kind === "cover" ? "Thumbnail preview" : "Article image preview"}</DialogTitle>
          <DialogDescription>
            A sample with the settings on screen, even unsaved ones. It is not saved or used anywhere.
            {usesAi && " It uses AI credits and takes around 20 seconds."}
          </DialogDescription>
        </DialogHeader>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Write or generate an article first to preview images on it.</p>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Label htmlFor={`preview-post-${kind}`}>Article</Label>
                <Select value={postId} onValueChange={setPostId} disabled={pending}>
                  <SelectTrigger id={`preview-post-${kind}`} className="w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-w-[var(--radix-select-trigger-width)]">{posts.map((post) => <SelectItem key={post.id} value={post.id}>{post.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={generate} disabled={pending || !postId} className="shrink-0">
                {pending && <LoaderCircle className="animate-spin" />}{pending ? "Generating…" : image ? "Generate again" : "Generate"}
              </Button>
            </div>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted/40" aria-busy={pending}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL preview
                <img src={image} alt="Generated preview" className={cn("size-full object-contain transition-opacity", pending && "opacity-40")} />
              ) : (
                <p className="px-6 text-center text-sm text-muted-foreground">{pending ? "Generating the preview…" : "Pick an article and generate a sample."}</p>
              )}
              {pending && <div aria-hidden className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />}
            </div>
            {pending && <p className="-mt-2 text-center text-xs text-muted-foreground">Keep this window open until it finishes.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
