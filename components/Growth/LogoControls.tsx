"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { LOGO_POSITIONS, type LogoPosition } from "@/lib/autopilot/logo";
import { cn } from "@/lib/utils";

/** The blog's logo for generated images: one PNG/WebP (transparent works best). */
export function LogoUploader({ blogId, value, onChange, disabled }: {
  blogId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("blogId", blogId);
      body.append("kind", "logo");
      const response = await fetch("/api/style-references", { method: "POST", body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") throw new Error(result.error || "The logo could not be uploaded");
      onChange(result.url);
      toast.success("Logo uploaded", { description: "Save to use it." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The logo could not be uploaded");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {value ? (
        <div className="relative flex h-16 w-28 items-center justify-center rounded-lg border bg-[repeating-conic-gradient(rgb(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:12px_12px] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- user upload on the media host */}
          <img src={value} alt="Logo" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            aria-label="Remove logo"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => input.current?.click()}
          className="flex h-16 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-card text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
        >
          {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading ? "Uploading…" : "Upload logo"}
        </button>
      )}
      <p className="text-xs text-muted-foreground">PNG, SVG or WebP, up to 2 MB. A transparent background works best.</p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/svg+xml,image/webp,image/jpeg"
        className="hidden"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
      />
    </div>
  );
}

/** Where the logo goes: nine dots on a 3×3 grid, or off. Shown only once a logo exists. */
export function LogoPositionPicker({ value, onChange, disabled }: {
  value: LogoPosition;
  onChange: (value: LogoPosition) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="grid aspect-video w-28 grid-cols-3 grid-rows-3 place-items-center rounded-lg border bg-card p-1.5" role="radiogroup" aria-label="Logo position">
        {LOGO_POSITIONS.map((position) => (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={value === position}
            aria-label={position.replace("-", " ")}
            title={position.replace("-", " ")}
            disabled={disabled}
            onClick={() => onChange(position)}
            className="flex size-5 items-center justify-center rounded-full"
          >
            <span className={cn("rounded-full transition-all", value === position ? "size-3 bg-foreground" : "size-1.5 bg-muted-foreground/40 hover:bg-muted-foreground")} />
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange("none")}
        className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors", value === "none" ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
      >
        No logo
      </button>
    </div>
  );
}
