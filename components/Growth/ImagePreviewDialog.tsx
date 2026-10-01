"use client";

import { useState, useTransition } from "react";
import { Eye, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { previewImageAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type PreviewSettings = {
  format?: string;
  colors?: string[];
  typography?: Record<string, unknown>;
  style: string | null;
  referenceUrls: string[];
  logoUrl: string | null;
  logoPosition: string;
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
      <DialogContent className="sm:max-w-2xl">
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
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor={`preview-post-${kind}`}>Article</Label>
                <Select value={postId} onValueChange={setPostId} disabled={pending}>
                  <SelectTrigger id={`preview-post-${kind}`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{posts.map((post) => <SelectItem key={post.id} value={post.id}>{post.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={generate} disabled={pending || !postId}>
                {pending && <LoaderCircle className="animate-spin" />}{pending ? "Generating…" : image ? "Generate again" : "Generate"}
              </Button>
            </div>
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL preview
                <img src={image} alt="Generated preview" className="size-full object-contain" />
              ) : (
                <p className="px-6 text-center text-sm text-muted-foreground">{pending ? "Generating the preview…" : "Pick an article and generate a sample."}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
