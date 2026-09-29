"use client";

import { X } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector/LanguageSelector";
import { MAX_BLOG_LANGUAGES } from "@/lib/blog-languages";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";

/**
 * Picks the languages a blog is written in. The first one is the main
 * language; clicking another language makes it the main one.
 */
export function BlogLanguagesPicker({ value, onChange, disabled }: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const languages = value.filter(Boolean);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {languages.map((code, index) => (
          <span
            key={code}
            className={cn(
              "flex h-9 items-center overflow-hidden rounded-full border bg-card text-sm text-card-foreground shadow-xs",
              index === 0 && "border-foreground",
            )}
          >
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => onChange([code, ...languages.filter((item) => item !== code)])}
              title={index === 0 ? undefined : "Make this the main language"}
              className={cn("flex h-full items-center pl-3 hover:bg-accent/60 disabled:cursor-default disabled:hover:bg-transparent", languages.length === 1 ? "pr-3" : "pr-1")}
            >
              {getLanguageName(code) ?? code}
              {index === 0 && <span className="ml-1.5 text-xs text-muted-foreground">Main</span>}
            </button>
            <button
              type="button"
              aria-label={`Remove ${getLanguageName(code) ?? code}`}
              disabled={disabled || languages.length === 1}
              onClick={() => onChange(languages.filter((item) => item !== code))}
              className={cn(
                "mr-1 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground",
                languages.length === 1 && "hidden",
              )}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      {!disabled && languages.length < MAX_BLOG_LANGUAGES && (
        <LanguageSelector
          key={languages.join(",")}
          onValueChange={(code) => onChange([...languages, code])}
          exclude={languages}
          required={false}
          placeholder="Add a language…"
        />
      )}
    </div>
  );
}
