"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAutopilotActiveAction } from "@/src/server/services/growth/actions";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

/** Pauses or resumes Autopilot, with when ideas refresh next. */
export function AutopilotToggle({ blogId, active: initialActive, nextDiscoveryAt: initialNext, running, aiReady }: {
  blogId: string;
  active: boolean;
  nextDiscoveryAt: string | null;
  running: boolean;
  aiReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(initialActive);
  const [nextDiscoveryAt, setNextDiscoveryAt] = useState(initialNext);

  function toggle(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const result = await setAutopilotActiveAction(blogId, next);
      if (result.error) { setActive(!next); toast.error(result.error); return; }
      setNextDiscoveryAt(result.nextDiscoveryAt ?? null);
      toast.success(next ? "Autopilot is on" : "Autopilot paused");
      router.refresh();
    });
  }

  const status = !active ? "Paused"
    : running ? "Refreshing ideas…"
      : nextDiscoveryAt ? `Next ideas ${dateLabel(nextDiscoveryAt)}`
        : "Active";

  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{status}</span>
      <Switch checked={active} onCheckedChange={toggle} disabled={pending || (!active && !aiReady)} aria-label="Autopilot active" />
    </label>
  );
}
