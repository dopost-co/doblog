"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { saveDiscoverySettingsAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUTOPILOT_PACE_OPTIONS, AUTOPILOT_PUBLISHING_OPTIONS, type AutopilotPublishingMode } from "@/lib/autopilot/options";
import { cn } from "@/lib/utils";

type Discovery = {
  website: string;
  frequency: "weekly" | "monthly";
  topicsPerRun: number;
  draftsPerWeek: number;
  publishingMode: AutopilotPublishingMode;
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

const STEPS = ["Website", "Frequency", "Publish"];
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
  const configured = Boolean(discovery.website && discovery.draftsPerWeek > 0);
  const [step, setStep] = useState(1);
  const [website, setWebsite] = useState(discovery.website);
  const [draftsPerWeek, setDraftsPerWeek] = useState(discovery.draftsPerWeek || 2);
  const [publishingMode, setPublishingMode] = useState<AutopilotPublishingMode>(discovery.website ? discovery.publishingMode : "auto_publish");
  const [message, setMessage] = useState<string | null>(null);

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
      }, true);
      if (result.error) { setMessage(result.error); return; }
      router.push(`/dashboard/blogs/${blogId}/autopilot?view=ideas`);
      router.refresh();
    });
  }

  const working = pending || discovery.running;
  const domainReady = website.trim().length >= 3;
  const providerWarning = !aiReady && <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
    <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
    <p>Connect OpenAI to start Autopilot. <Link href={`/dashboard/blogs/${blogId}/settings/providers`} className="font-medium underline underline-offset-2">Open Providers</Link></p>
  </div>;

  if (configured) {
    return <form onSubmit={submit} className="w-full max-w-4xl">
      <div className="border-b pb-5">
        <h2 className="text-xl font-semibold">Autopilot settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Zenex keeps finding ideas and writing on this schedule.</p>
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

      {providerWarning}
      {!seoReady && <p className="mt-3 text-xs text-muted-foreground">Search-volume data is off. Zenex can still work from your site and existing content.</p>}
      {message && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-xs text-muted-foreground">{discovery.nextDiscoveryAt ? `Next idea refresh: ${dateLabel(discovery.nextDiscoveryAt)}.` : "The first idea refresh will start after saving."}</p>
        <Button type="submit" disabled={working || !aiReady || !domainReady}>{working && <LoaderCircle className="animate-spin" />}{working ? "Updating Autopilot…" : "Save and refresh ideas"}</Button>
      </div>
    </form>;
  }

  return <div className="w-full max-w-3xl">
    <div className="border-b pb-5">
      <h2 className="text-xl font-semibold">Set up your content autopilot</h2>
      <p className="mt-1 text-sm text-muted-foreground">Three short choices. You can change them whenever you want.</p>
      <ol className="mt-5 grid w-full max-w-lg grid-cols-3 gap-2" aria-label="Setup progress">
        {STEPS.map((label, index) => {
          const number = index + 1;
          return <li key={label} className="space-y-1.5">
            <div className={cn("h-1 rounded-full transition-colors duration-300", step >= number ? "bg-primary" : "bg-muted")} />
            <span className={cn("text-xs transition-colors", step === number ? "font-medium text-foreground" : "text-muted-foreground")}>{label}</span>
          </li>;
        })}
      </ol>
    </div>

    <div className="py-7"><form onSubmit={submit}><div key={step} className="animate-in fade-in slide-in-from-right-3 duration-300">
      {step === 1 && <section className="max-w-xl py-4">
        <h2 className="text-xl font-semibold">What is your website?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Zenex will find its sitemap and understand what you already cover.</p>
        <Label htmlFor="growth-domain" className="sr-only">Website address</Label>
        <Input id="growth-domain" value={website} onChange={(event) => setWebsite(event.target.value)} className="mt-7 h-12 text-base" placeholder="https://yourwebsite.com" autoFocus required disabled={pending} />
        <Button type="button" className="mt-5" size="lg" disabled={!domainReady} onClick={() => setStep(2)}>Continue</Button>
        <p className="mt-3 text-xs text-muted-foreground">Nothing runs until the final step.</p>
      </section>}
      {step === 2 && <section>
        <h2 className="text-xl font-semibold">How often should Zenex write?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Every article receives an exact generation date. New ideas are added automatically.</p>
        <div className="mt-7"><PaceChoices value={draftsPerWeek} onChange={setDraftsPerWeek} /></div>
        <div className="mt-7 flex items-center justify-between"><Button type="button" variant="ghost" onClick={() => setStep(1)}>Back</Button><Button type="button" onClick={() => setStep(3)}>Continue</Button></div>
      </section>}
      {step === 3 && <section>
        <h2 className="text-xl font-semibold">What happens when an article is ready?</h2>
        <p className="mt-2 text-sm text-muted-foreground">Choose once. The queue will show the result for every article.</p>
        <div className="mt-7"><PublishingChoices value={publishingMode} onChange={setPublishingMode} /></div>
        <div className="mt-5">{providerWarning}</div>
        {!seoReady && <p className="mt-3 text-xs text-muted-foreground">Search-volume data is off. Zenex can still work from your site and existing content.</p>}
        {message && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>}
        <div className="mt-7 flex items-center justify-between"><Button type="button" variant="ghost" onClick={() => setStep(2)} disabled={pending}>Back</Button><Button type="submit" disabled={working || !aiReady}>{working && <LoaderCircle className="animate-spin" />}{working ? "Building your plan…" : "Build my plan"}</Button></div>
      </section>}
    </div></form></div>

    {(discovery.lastRun || discovery.nextDiscoveryAt) && <div className="mt-4 text-xs text-muted-foreground">
      {discovery.lastRun && <>Last check: {discovery.lastRun.suggestionsAdded} ideas from {discovery.lastRun.discoveredPages} pages.</>}
      {discovery.nextDiscoveryAt && <> Next check: {dateLabel(discovery.nextDiscoveryAt)}.</>}
      {discovery.lastRun?.error && <p className="mt-2 text-destructive">Last check: {discovery.lastRun.error}</p>}
    </div>}
  </div>;
}
