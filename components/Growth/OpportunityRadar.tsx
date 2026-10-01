"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { saveDiscoverySettingsAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTOPILOT_PUBLISHING_OPTIONS, type AutopilotPublishingMode } from "@/lib/autopilot/options";
import { WritingDaysPicker } from "./WritingDaysPicker";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/components/UnsavedChanges/UnsavedChangesProvider";
import { toast } from "sonner";

type Discovery = {
  website: string;
  writingDays: number[];
  publishingMode: AutopilotPublishingMode;
};

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
  const [writingDays, setWritingDays] = useState(discovery.writingDays);
  const [publishingMode, setPublishingMode] = useState<AutopilotPublishingMode>(discovery.publishingMode);

  const { markSaved } = useUnsavedChanges({ value: { website, writingDays, publishingMode }, save: persist });

  async function persist() {
    const result = await saveDiscoverySettingsAction(blogId, {
      website,
      frequency: "weekly",
      topicsPerRun: Math.max(8, writingDays.length * 4),
      writingDays,
      publishingMode,
    });
    if (result.error) { toast.error(result.error); return false; }
    markSaved();
    toast.success("Schedule saved");
    router.refresh();
    return true;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => { await persist(); });
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
        <h3 className="text-sm font-medium">Writing days</h3>
        <WritingDaysPicker value={writingDays} onChange={setWritingDays} disabled={pending} />
      </section>
      <section className="grid gap-4 py-6 md:grid-cols-[11rem_1fr] md:gap-8">
        <h3 className="text-sm font-medium">Publishing</h3>
        <PublishingChoices value={publishingMode} onChange={setPublishingMode} />
      </section>
    </div>

    <div className="flex items-center justify-end gap-3 border-t pt-5">
      <Button type="submit" disabled={pending || website.trim().length < 3 || writingDays.length === 0}>{pending && <LoaderCircle className="animate-spin" />}{pending ? "Saving…" : "Save"}</Button>
    </div>
  </form>;
}
