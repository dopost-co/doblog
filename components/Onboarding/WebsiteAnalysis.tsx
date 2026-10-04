"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANALYSIS_STAGES, type AnalysisEvent, type AnalysisMessage, type AnalysisStageId, type SiteAnalysis } from "@/lib/onboarding/analysis";

type StageState = { status: AnalysisEvent["status"] | "waiting"; detail?: string };
export type AnalysisStatus = "running" | "done" | "failed";

const initialStages = () => Object.fromEntries(ANALYSIS_STAGES.map((stage) => [stage.id, { status: "waiting" }])) as Record<AnalysisStageId, StageState>;

type Run = { messages: AnalysisMessage[]; listeners: Set<(message: AnalysisMessage) => void>; finished: boolean };
/**
 * Analyses in progress, by blog and website. Every mount of the component
 * (React mounts twice in development, and steps remount) follows the same
 * run instead of paying for another one.
 */
const runs = new Map<string, Run>();

function followAnalysis(blogId: string, website: string, listener: (message: AnalysisMessage) => void) {
  const key = `${blogId}:${website.trim().toLowerCase()}`;
  let run = runs.get(key);
  if (!run) {
    const created: Run = { messages: [], listeners: new Set(), finished: false };
    run = created;
    runs.set(key, created);
    const emit = (message: AnalysisMessage) => {
      created.messages.push(message);
      for (const notify of created.listeners) notify(message);
    };
    void (async () => {
      try {
        const response = await fetch("/api/onboarding/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blogId, website }),
        });
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(body?.error || "The website could not be analyzed");
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) emit(JSON.parse(line) as AnalysisMessage);
        }
        if (!created.messages.some((message) => message.type !== "stage")) throw new Error("The analysis stopped before finishing");
      } catch (cause) {
        emit({ type: "error", error: cause instanceof Error ? cause.message : "The website could not be analyzed" });
      } finally {
        created.finished = true;
        // A failed analysis can be tried again by coming back to this step.
        if (created.messages.some((message) => message.type === "error")) runs.delete(key);
      }
    })();
  }
  for (const message of run.messages) listener(message);
  run.listeners.add(listener);
  const followed = run;
  return () => { followed.listeners.delete(listener); };
}

/**
 * Reads the blog's website and shows each stage as the server reports it.
 * The result is saved on the server and handed to `onResult`.
 */
export function WebsiteAnalysis({ blogId, website, result = null, onResult, onStatus }: {
  blogId: string;
  website: string;
  /** An analysis this session already made of the same website: shown again, not repeated. */
  result?: SiteAnalysis | null;
  onResult: (analysis: SiteAnalysis) => void;
  onStatus: (status: AnalysisStatus) => void;
}) {
  const [stages, setStages] = useState(() => result
    ? Object.fromEntries(ANALYSIS_STAGES.map((stage) => [stage.id, { status: "done" }])) as Record<AnalysisStageId, StageState>
    : initialStages());
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(result);
  // Latest callbacks, so messages from the run never call stale ones.
  const callbacks = useRef({ onResult, onStatus });
  useEffect(() => { callbacks.current = { onResult, onStatus }; });
  const known = useRef(Boolean(result));

  useEffect(() => {
    if (known.current) return;
    let reported = false;
    const stop = followAnalysis(blogId, website, (message) => {
      if (message.type === "stage") {
        setStages((current) => ({ ...current, [message.stage]: { status: message.status, detail: message.detail } }));
      } else if (message.type === "result") {
        setAnalysis(message.analysis);
        callbacks.current.onResult(message.analysis);
        callbacks.current.onStatus("done");
        reported = true;
      } else {
        setError(message.error);
        callbacks.current.onStatus("failed");
        reported = true;
      }
    });
    if (!reported) callbacks.current.onStatus("running");
    return stop;
  }, [blogId, website]);

  const completed = ANALYSIS_STAGES.filter((stage) => stages[stage.id].status === "done" || stages[stage.id].status === "failed").length;
  const progress = analysis || error ? 100 : Math.round((completed / ANALYSIS_STAGES.length) * 100);

  return (
    <div className="space-y-6">
      <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", error ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.max(progress, 4)}%` }} />
      </div>

      <ol className="space-y-3">
        {ANALYSIS_STAGES.map((stage) => {
          const state = stages[stage.id];
          return (
            <li key={stage.id} className={cn("flex items-start gap-3 transition-opacity duration-300", state.status === "waiting" && "opacity-40")}>
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                {state.status === "running" ? <LoaderCircle className="size-4 animate-spin text-primary" />
                  : state.status === "done" ? <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                    : state.status === "failed" ? <X className="size-4 text-muted-foreground" />
                      : <Circle className="size-3 text-muted-foreground" />}
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{stage.label}</span>
                {/* Reserved line height so details appearing never push the list around. */}
                <span className={cn("block min-h-4 truncate text-xs text-muted-foreground transition-opacity duration-300", state.detail ? "opacity-100" : "opacity-0")}>
                  {state.detail ?? " "}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="text-sm text-muted-foreground">
          {error.replace(/\.$/, "")}. You can continue and fill in the next steps yourself.
        </p>
      )}

      {analysis && <AnalysisSummary analysis={analysis} />}
    </div>
  );
}

function AnalysisSummary({ analysis }: { analysis: SiteAnalysis }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {analysis.summary && <p className="text-sm">{analysis.summary}</p>}
      {(analysis.colors.length > 0 || analysis.images.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {analysis.colors.map((color) => (
            <span key={color} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-4 rounded-full border" style={{ backgroundColor: color }} />{color}
            </span>
          ))}
          {analysis.images.length > 0 && <SiteImages images={analysis.images} />}
        </div>
      )}
      {analysis.competitors.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Competitors: {analysis.competitors.map((item) => item.domain).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Small previews of the website images a style was learned from. */
export function SiteImages({ images }: { images: string[] }) {
  return (
    <span className="flex gap-1.5">
      {images.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element -- images from the user's own website, not optimized by Next.
        <img key={url} src={url} alt="" loading="lazy" className="size-10 rounded-md border object-cover" />
      ))}
    </span>
  );
}
