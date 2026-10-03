"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { stage: "sitemap", label: "Reading your website" },
  { stage: "research", label: "Researching searches" },
  { stage: "planning", label: "Choosing the best ideas" },
] as const;

const POLL_MS = 3_000;

/**
 * Shown while ideas are being found: which step is running, refreshing the
 * page until the run ends so new ideas appear without reloading.
 */
export function DiscoveryProgress({ stage }: { stage: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  const current = Math.max(0, STEPS.findIndex((step) => step.stage === stage));
  const percent = Math.round(((current + 0.5) / STEPS.length) * 100);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Finding ideas…</span>
        <span className="text-xs text-muted-foreground">Usually 1–3 minutes. You can leave this page.</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${percent}%` }} />
      </div>
      <ol className="flex flex-col gap-1.5 text-sm sm:flex-row sm:gap-5">
        {STEPS.map((step, index) => (
          <li key={step.stage} className={cn("flex items-center gap-1.5", index > current && "text-muted-foreground")}>
            {index < current ? <Check className="size-3.5 text-emerald-600" />
              : index === current ? <LoaderCircle className="size-3.5 animate-spin" />
                : <span className="size-3.5 rounded-full border" />}
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
