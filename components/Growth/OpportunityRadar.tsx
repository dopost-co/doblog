"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { saveDiscoverySettingsAction, setAutopilotActiveAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AUTOPILOT_PACE_OPTIONS, AUTOPILOT_PUBLISHING_OPTIONS, type AutopilotPublishingMode } from "@/lib/autopilot/options";
import { cn } from "@/lib/utils";

type Discovery = {
  website: string;
  frequency: "weekly" | "monthly";
  topicsPerRun: number;
  draftsPerWeek: number;
  publishingMode: AutopilotPublishingMode;
  active: boolean;
  nextDiscoveryAt: string | null;
  lastDiscoveryAt: string | null;
  running: boolean;
  lastRun: {
    status: string;
    discoveredPages: number;
    suggestionsAdded: number;
    warnings: string[];
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
};

const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : null;

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

export function OpportunityRadar({ blogId, discovery, aiReady, seoReady }: {
  blogId: string;
  discovery: Discovery;
  aiReady: boolean;
  seoReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [active, setActive] = useState(discovery.active);
  const [nextDiscoveryAt, setNextDiscoveryAt] = useState(discovery.nextDiscoveryAt);
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
      setMessage({ tone: "success", text: "Saved." });
      router.refresh();
    });
  }

  function toggle(next: boolean) {
    setMessage(null);
    setActive(next);
    startToggle(async () => {
      const result = await setAutopilotActiveAction(blogId, next);
      if (result.error) { setActive(!next); setMessage({ tone: "error", text: result.error }); return; }
      setNextDiscoveryAt(result.nextDiscoveryAt ?? null);
      router.refresh();
    });
  }

  const domainReady = website.trim().length >= 3;
  const status = !active ? "Paused. Zenex is not refreshing ideas or writing."
    : discovery.running ? "Refreshing ideas now…"
      : nextDiscoveryAt ? `Next idea refresh: ${dateLabel(nextDiscoveryAt)}.`
        : "Ideas refresh weekly.";

  return <form onSubmit={submit} className="w-full max-w-4xl">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div>
        <h2 className="text-xl font-semibold">Autopilot settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">{status}</p>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        {active ? "Active" : "Paused"}
        <Switch checked={active} onCheckedChange={toggle} disabled={toggling || (!active && !aiReady)} aria-label="Autopilot active" />
      </label>
    </div>

    <div className="divide-y">
      <section className="grid gap-4 py-7 md:grid-cols-[11rem_1fr] md:gap-8">
        <div><h3 className="text-sm font-medium">Website</h3><p className="mt-1 text-xs text-muted-foreground">Sitemap detected automatically.</p></div>
        <div className="max-w-xl"><Label htmlFor="growth-domain">Website address</Label><Input id="growth-domain" value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-1.5 h-11" required disabled={pending} /></div>
      </section>
      <section className="grid gap-4 py-7 md:grid-cols-[11rem_1fr] md:gap-8">
        <div><h3 className="text-sm font-medium">Writing pace</h3><p className="mt-1 text-xs text-muted-foreground">Ideas are replenished weekly.</p></div>
        <PaceChoices value={draftsPerWeek} onChange={setDraftsPerWeek} />
      </section>
      <section className="grid gap-4 py-7 md:grid-cols-[11rem_1fr] md:gap-8">
        <div><h3 className="text-sm font-medium">Publishing</h3><p className="mt-1 text-xs text-muted-foreground">What happens after writing.</p></div>
        <PublishingChoices value={publishingMode} onChange={setPublishingMode} />
      </section>
    </div>

    {!aiReady && <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <p>Connect OpenAI to run Autopilot. <Link href={`/dashboard/blogs/${blogId}/settings/providers`} className="font-medium underline underline-offset-2">Open Providers</Link></p>
    </div>}
    {!seoReady && <p className="mt-3 text-xs text-muted-foreground">Search-volume data is off. Zenex can still work from your site and existing content.</p>}
    {message && <p role={message.tone === "error" ? "alert" : "status"} className={cn(
      "mt-4 text-sm",
      message.tone === "error" ? "rounded-lg bg-destructive/10 px-4 py-3 text-destructive" : "text-emerald-600 dark:text-emerald-400",
    )}>{message.text}</p>}
    <div className="mt-6 flex justify-end border-t pt-5">
      <Button type="submit" disabled={pending || !domainReady}>{pending && <LoaderCircle className="animate-spin" />}{pending ? "Saving…" : "Save"}</Button>
    </div>
  </form>;
}
