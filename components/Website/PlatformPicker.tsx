"use client";

import { cn } from "@/lib/utils";
import { DELIVERY_METHODS, SITE_PLATFORMS } from "@/lib/publishing/platforms";

function Card({ title, example, badge, selected, disabled, onClick }: {
  title: string; example: string; badge?: string; selected: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.03] disabled:opacity-60",
        selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {title}
        {badge && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{badge}</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{example}</span>
    </button>
  );
}

/** "What website do you have?" as cards. */
export function SitePlatformCards({ value, onChange, disabled, detected }: {
  value: string | null; onChange: (platform: string) => void; disabled?: boolean; detected?: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SITE_PLATFORMS.map((platform) => (
        <Card
          key={platform.id}
          title={platform.title}
          example={platform.example}
          badge={detected === platform.id ? "Detected" : undefined}
          selected={value === platform.id}
          disabled={disabled}
          onClick={() => onChange(platform.id)}
        />
      ))}
    </div>
  );
}

/** "How should articles reach your site?", only for sites built in code. */
export function DeliveryMethodCards({ value, onChange, disabled }: {
  value: string | null; onChange: (method: string) => void; disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {DELIVERY_METHODS.map((method) => (
        <Card
          key={method.id}
          title={method.title}
          example={method.example}
          badge={method.recommended ? "Recommended" : undefined}
          selected={value === method.id}
          disabled={disabled}
          onClick={() => onChange(method.id)}
        />
      ))}
    </div>
  );
}
