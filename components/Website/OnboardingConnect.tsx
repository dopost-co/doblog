"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { connectionForSetup } from "@/src/server/services/publishing/actions";
import { ConnectPanel, type ConnectDestination } from "./ConnectPanel";

/** The last onboarding step: the same connection steps as Settings → Web integration. */
export function OnboardingConnect({ blogId, onConnected }: { blogId: string; onConnected: () => void }) {
  const [setup, setSetup] = useState<{ destination: ConnectDestination | null; website: string | null } | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    connectionForSetup(blogId).then((result) => {
      if (!active) return;
      if ("error" in result && result.error) setError(result.error);
      else if ("website" in result) setSetup({ destination: result.destination ?? null, website: result.website ?? null });
    });
    return () => { active = false; };
  }, [blogId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!setup) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>;
  if (!setup.destination) return <p className="text-sm text-muted-foreground">You can connect your website later in Settings → Web integration.</p>;
  if (connected || setup.destination.status === "connected") {
    return <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-emerald-500" /> Connected. Published articles are copied to your site.</p>;
  }
  return (
    <ConnectPanel
      embedded
      blogId={blogId}
      destination={setup.destination}
      website={setup.website}
      onConnected={() => { setConnected(true); onConnected(); }}
    />
  );
}
