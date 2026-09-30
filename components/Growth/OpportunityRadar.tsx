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
  writingDays: number[];
  publishingMode: AutopilotPublishingMode;
};

/** Monday first; values are UTC weekdays as stored (0 = Sunday). */
const WEEKDAYS = [
  { value: 1, short: "M", name: "Monday" },
  { value: 2, short: "T", name: "Tuesday" },
  { value: 3, short: "W", name: "Wednesday" },
  { value: 4, short: "T", name: "Thursday" },
  { value: 5, short: "F", name: "Friday" },
  { value: 6, short: "S", name: "Saturday" },
  { value: 0, short: "S", name: "Sunday" },
] as const;

/** A preset weekly pace, or "custom" with the exact weekdays to write on. */
type Pace = { custom: false; perWeek: number } | { custom: true; days: number[] };

function PaceChoices({ value, onChange }: { value: Pace; onChange: (value: Pace) => void }) {
  const card = (selected: boolean) => cn(
    "rounded-xl border bg-card p-4 text-left transition-all duration-200 hover:border-primary/60 hover:bg-primary/[0.03]",
    selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
  );
  const days = value.custom ? value.days : [];
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {AUTOPILOT_PACE_OPTIONS.map((option) => {
        const selected = !value.custom && value.perWeek === option.value;
        return <button key={option.value} type="button" onClick={() => onChange({ custom: false, perWeek: option.value })} aria-pressed={selected} className={card(selected)}>
          <span className="block text-sm font-medium">{option.label}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{option.help}</span>
        </button>;
      })}
      <button type="button" onClick={() => onChange({ custom: true, days: value.custom ? value.days : [1, 3, 5] })} aria-pressed={value.custom} className={card(value.custom)}>
        <span className="block text-sm font-medium">Custom</span>
        <span className="mt-1 block text-xs text-muted-foreground">Pick the days</span>
      </button>
    </div>
    {value.custom && <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
      <div className="flex gap-1.5" role="group" aria-label="Writing days">
        {WEEKDAYS.map((day) => {
          const selected = days.includes(day.value);
          return <button
            key={day.value}
            type="button"
            title={day.name}
            aria-label={day.name}
            aria-pressed={selected}
            onClick={() => onChange({ custom: true, days: selected ? days.filter((item) => item !== day.value) : [...days, day.value] })}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border text-sm transition-colors",
              selected ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >{day.short}</button>;
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {days.length ? `${days.length} ${days.length === 1 ? "article" : "articles"} a week, written in the morning (UTC).` : "Choose at least one day."}
      </p>
    </div>}
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
  const [pace, setPace] = useState<Pace>(discovery.writingDays.length
    ? { custom: true, days: discovery.writingDays }
    : { custom: false, perWeek: discovery.draftsPerWeek || 2 });
  const draftsPerWeek = pace.custom ? pace.days.length : pace.perWeek;
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
        writingDays: pace.custom ? pace.days : [],
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
        <PaceChoices value={pace} onChange={setPace} />
      </section>
      <section className="grid gap-4 py-6 md:grid-cols-[11rem_1fr] md:gap-8">
        <h3 className="text-sm font-medium">Publishing</h3>
        <PublishingChoices value={publishingMode} onChange={setPublishingMode} />
      </section>
    </div>

    <div className="flex items-center justify-end gap-3 border-t pt-5">
      {message && <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-muted-foreground")}>{message.text}</p>}
      <Button type="submit" disabled={pending || website.trim().length < 3 || draftsPerWeek === 0}>{pending && <LoaderCircle className="animate-spin" />}{pending ? "Saving…" : "Save"}</Button>
    </div>
  </form>;
}
