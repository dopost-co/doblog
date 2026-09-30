"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";

const MAX_REFERENCES = 2;

/**
 * Up to two reference images that generated images follow in style. Files go
 * to /api/style-references, which stores them in the blog's media storage.
 */
export function StyleReferencesPicker({ blogId, value, onChange, disabled }: {
  blogId: string | null;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const references = value.filter(Boolean);

  async function upload(file: File) {
    if (!blogId) return;
    setError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("blogId", blogId);
      const response = await fetch("/api/style-references", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "The image could not be uploaded");
      onChange([...references, result.url]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The image could not be uploaded");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Reference images <span className="font-normal text-muted-foreground">(optional)</span></p>
        <p className="text-xs text-muted-foreground">Up to {MAX_REFERENCES}. Zenex follows their style, not their content.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {references.map((url) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-lg border bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- user uploads on the media host */}
            <img src={url} alt="Style reference" className="size-full object-cover" />
            <button
              type="button"
              aria-label="Remove reference"
              disabled={disabled}
              onClick={() => onChange(references.filter((item) => item !== url))}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {references.length < MAX_REFERENCES && (
          <button
            type="button"
            disabled={disabled || uploading || !blogId}
            onClick={() => input.current?.click()}
            className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
          >
            {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {uploading ? "Uploading…" : "Add"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
