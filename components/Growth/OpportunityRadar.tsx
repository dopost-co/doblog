"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { saveDiscoverySettingsAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTOPILOT_PACE_OPTIONS, AUTOPILOT_PUBLISHING_OPTIONS, type AutopilotPublishingMode } from "@/lib/autopilot/options";
import { cn } from "@/lib/utils";

type Discovery = {
  website: string;
  draftsPerWeek: number;
  publishingMode: AutopilotPublishingMode;
};

function PaceChoices({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {AUTOPILOT_PACE_OPTIONS.map((option) => {
      const selected = value === option.value;
      return <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={selected} className={cn(
        "rounded-xl border bg-card p-4 text-left transition-all duration-200 hover:border-primary/60 hover:bg-primary/[0.03]",
        selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
      )}>
        <span className="block text-sm font-medium">{option.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{option.help}</span>
      </button>;
    })}
  </div>;
}

function PublishingChoices({ value, onChange }: { value: AutopilotPublishingMode; onChange: (value: AutopilotPublishingMode) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    {AUTOPILOT_PUBLISHING_OPTIONS.map((option) => {
      const selected = value === option.value;
      return <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={selected} className={cn(
        "rounded-xl border bg-card p-5 text-left transition-all duration-200 hover:border-primary/60 hover:bg-primary/[0.03]",
        selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
      )}>
        <span className="block text-sm font-medium">{option.title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.help}</span>
      </button>;
    })}
  </div>;
}

export function OpportunityRadar({ blogId, discovery, aiReady }: {
  blogId: string;
  discovery: Discovery;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [website, setWebsite] = useState(discovery.website);
  const [draftsPerWeek, setDraftsPerWeek] = useState(discovery.draftsPerWeek || 2);
  const [publishingMode, setPublishingMode] = useState<AutopilotPublishingMode>(discovery.publishingMode);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await saveDiscoverySettingsAction(blogId, {
        website,
        frequency: "weekly",
        topicsPerRun: Math.max(8, draftsPerWeek * 4),
        draftsPerWeek,
        publishingMode,
      });
      if (result.error) { setMessage({ tone: "error", text: result.error }); return; }
      setMessage({ tone: "success", text: "Saved" });
      router.refresh();
    });
  }

  return <form onSubmit={submit} className="w-full max-w-4xl">
    {!aiReady && <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
      <CircleAlert className="size-4 shrink-0 text-amber-600" />
      <span>Connect OpenAI in <Link href={`/dashboard/blogs/${blogId}/settings/providers`} className="text-foreground underline underline-offset-4">Providers</Link> to run Autopilot.</span>
    </p>}

    <div className="divide-y">
      <section className="grid gap-4 py-6 md:grid-cols-[11rem_1fr] md:gap-8">
        <h3 className="text-sm font-medium">Website</h3>
        <Input aria-label="Website address" value={website} onChange={(event) => setWebsite(event.target.value)} className="max-w-xl" required disabled={pending} />
      </section>
      <section className="grid gap-4 py-6 md:grid-cols-[11rem_1fr] md:gap-8">
        <h3 className="text-sm font-medium">Writing pace</h3>
        <PaceChoices value={draftsPerWeek} onChange={setDraftsPerWeek} />
      </section>
      <section className="grid gap-4 py-6 md:grid-cols-[11rem_1fr] md:gap-8">
        <h3 className="text-sm font-medium">Publishing</h3>
        <PublishingChoices value={publishingMode} onChange={setPublishingMode} />
      </section>
    </div>

    <div className="flex items-center justify-end gap-3 border-t pt-5">
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-muted-foreground")}>{message.text}</p>}
      <Button type="submit" disabled={pending || website.trim().length < 3}>{pending && <LoaderCircle className="animate-spin" />}{pending ? "Saving…" : "Save"}</Button>
    </div>
  </form>;
}
