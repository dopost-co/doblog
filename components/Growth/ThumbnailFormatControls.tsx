"use client";

import { useEffect, useState } from "react";
import { AlignCenter, AlignLeft, Plus, X } from "lucide-react";
import { COVER_FONTS, MAX_GRADIENT_COLORS, THUMBNAIL_FORMATS, type CoverFont, type CoverTypography, type ThumbnailFormat } from "@/lib/autopilot/thumbnail-templates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Which kind of thumbnail Autopilot makes: an AI image, a brand card, or both. */
export function ThumbnailFormatPicker({ value, onChange, disabled }: {
  value: ThumbnailFormat;
  onChange: (value: ThumbnailFormat) => void;
  disabled?: boolean;
}) {
  const selected = THUMBNAIL_FORMATS.find((format) => format.id === value) ?? THUMBNAIL_FORMATS[0];
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1" role="radiogroup" aria-label="Thumbnail format">
        {THUMBNAIL_FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            role="radio"
            aria-checked={value === format.id}
            disabled={disabled}
            onClick={() => onChange(format.id)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              value === format.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {format.title}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{selected.example}</p>
    </div>
  );
}

/** Cover headlines, not article titles: what the thumbnail actually draws. */
const SAMPLE_TITLES = {
  short: "Content batching",
  long: "Content batching for small teams",
};

/** A compact segmented control for one setting. */
function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T;
  options: readonly { id: T; name: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-8 items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          aria-label={option.title}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={cn(
            "flex h-full items-center rounded-md px-2.5 text-xs font-medium transition-colors",
            value === option.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The brand card's look: gradient (two or three colors) and text, with a live preview. */
export function BrandCardEditor({ format, colors, onChange, typography, onTypographyChange, blogName, disabled }: {
  format: ThumbnailFormat;
  colors: string[];
  onChange: (colors: string[]) => void;
  typography: CoverTypography;
  onTypographyChange: (typography: CoverTypography) => void;
  blogName: string;
  disabled?: boolean;
}) {
  const [sample, setSample] = useState<keyof typeof SAMPLE_TITLES>("short");
  const set = <K extends keyof CoverTypography>(key: K, value: CoverTypography[K]) => onTypographyChange({ ...typography, [key]: value });

  // The preview follows the settings after a short pause, not on every drag step.
  const query = new URLSearchParams({
    format, colors: colors.join(","), blog: blogName, title: SAMPLE_TITLES[sample],
    font: typography.font, size: typography.size, bold: typography.bold ? "1" : "0",
    align: typography.align, name: typography.showBlogName ? "1" : "0",
  }).toString();
  const [previewQuery, setPreviewQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setPreviewQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="grid gap-4">
      <Control label="Colors">
        <div className="flex flex-wrap items-center gap-3">
          {colors.map((color, index) => (
            <label key={index} className="flex items-center gap-1.5 text-sm">
              <input
                type="color"
                value={color}
                disabled={disabled}
                onChange={(event) => onChange(colors.map((current, i) => (i === index ? event.target.value : current)))}
                className="size-8 cursor-pointer rounded-md border bg-card p-0.5"
                aria-label={`Gradient color ${index + 1}`}
              />
              <span className="font-mono text-xs">{color}</span>
              {colors.length > 2 && (
                <button type="button" aria-label={`Remove color ${index + 1}`} disabled={disabled} onClick={() => onChange(colors.filter((_, i) => i !== index))} className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          ))}
          {colors.length < MAX_GRADIENT_COLORS && (
            <button type="button" disabled={disabled} onClick={() => onChange([...colors.slice(0, 1), colors[0], ...colors.slice(1)])} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Plus className="size-3.5" />Add color
            </button>
          )}
        </div>
      </Control>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Control label="Font">
          <Select value={typography.font} onValueChange={(value) => set("font", value as CoverFont)} disabled={disabled}>
            <SelectTrigger size="sm" className="w-40" aria-label="Font"><SelectValue /></SelectTrigger>
            <SelectContent>{COVER_FONTS.map((font) => <SelectItem key={font.id} value={font.id}>{font.name}</SelectItem>)}</SelectContent>
          </Select>
        </Control>
        <Control label="Size">
          <Segmented label="Title size" value={typography.size} onChange={(value) => set("size", value)} disabled={disabled}
            options={[{ id: "small", name: "S", title: "Small" }, { id: "medium", name: "M", title: "Medium" }, { id: "large", name: "L", title: "Large" }]} />
        </Control>
        <Control label="Weight">
          <Segmented label="Title weight" value={typography.bold ? "bold" : "regular"} onChange={(value) => set("bold", value === "bold")} disabled={disabled}
            options={[{ id: "regular", name: "Regular" }, { id: "bold", name: <span className="font-bold">Bold</span>, title: "Bold" }]} />
        </Control>
        <Control label="Align">
          <Segmented label="Text alignment" value={typography.align} onChange={(value) => set("align", value)} disabled={disabled}
            options={[{ id: "left", name: <AlignLeft className="size-3.5" />, title: "Left" }, { id: "center", name: <AlignCenter className="size-3.5" />, title: "Center" }]} />
        </Control>
        <label className="flex h-8 items-center gap-2 text-sm">
          <Switch checked={typography.showBlogName} onCheckedChange={(checked) => set("showBlogName", checked)} disabled={disabled} />
          Blog name
        </label>
      </div>

      <div className="grid max-w-md gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Covers draw a short headline written for each article, not its full title.</span>
          <Segmented label="Sample headline" value={sample} onChange={setSample}
            options={[{ id: "short", name: "Short" }, { id: "long", name: "Long" }]} />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered preview PNG */}
        <img
          src={`/api/cover-preview?${previewQuery}`}
          alt="Preview of the brand thumbnail"
          className="aspect-video w-full rounded-lg border bg-muted object-cover"
        />
      </div>
    </div>
  );
}
