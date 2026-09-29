"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Clock3, FileText, ImageOff, LoaderCircle, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { languages } from "@/lib/languages";
import { addPlanItemAction, generatePlanItemAction, removePlanItemAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type PlanItem = {
  id: string;
  primaryKeyword: string;
  title: string | null;
  language: string;
  intent: string | null;
  source: string;
  rationale: string | null;
  opportunitySnapshot: { priority?: string; metrics?: { searchVolume?: number; difficulty?: number } | null } | null;
  status: string;
  scheduledFor: string | null;
  lastError: string | null;
  createdAt: string;
  post: { id: string; title: string; status: string; coverImage: string | null; publishedAt: string | null } | null;
  runs: Array<{ id: string; status: string; stage: string; error: string | null; createdAt: string; completedAt: string | null }>;
};

const STATUS_STYLE = {
  planned: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  generating: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
} as const;

const scheduledLabel = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));

export function GrowthPlanManager({ blogId, items, defaultLanguage, aiReady, mediaReady, publishingMode }: {
  blogId: string;
  items: PlanItem[];
  defaultLanguage: string;
  aiReady: boolean;
  mediaReady: boolean;
  publishingMode: "review" | "auto_publish";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [language, setLanguage] = useState(defaultLanguage);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage(null);
    startTransition(async () => {
      const result = await addPlanItemAction(blogId, {
        keyword: String(data.get("keyword") || ""), language,
        title: String(data.get("title") || "").trim() || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
      });
      if (result.error) return setMessage({ tone: "error", text: result.error });
      form.reset();
      setMessage({ tone: "success", text: "Added to the queue." });
      router.refresh();
    });
  }

  function generate(itemId: string) {
    setActiveItem(itemId);
    setMessage(null);
    startTransition(async () => {
      const result = await generatePlanItemAction(blogId, itemId);
      setActiveItem(null);
      if (result.error) setMessage({ tone: "error", text: result.error });
      else if ("title" in result) setMessage({
        tone: "success",
        text: result.published ? `“${result.title}” is now live.` : `“${result.title}” is ready to review.`,
      });
      router.refresh();
    });
  }

  function remove(itemId: string) {
    setActiveItem(itemId);
    setMessage(null);
    startTransition(async () => {
      const result = await removePlanItemAction(blogId, itemId);
      setActiveItem(null);
      if (result.error) setMessage({ tone: "error", text: result.error });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {!mediaReady && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <ImageOff className="mt-0.5 size-4 shrink-0" />
          <p>Image storage is not configured. Drafts still work, but generated cover and in-article images will be skipped.</p>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your article queue</h2>
            <p className="text-sm text-muted-foreground">Generation and publication are shown separately, so you always know what happens next.</p>
          </div>
          {message && <p role={message.tone === "error" ? "alert" : "status"} className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-emerald-700 dark:text-emerald-300")}>{message.text}</p>}
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No articles are waiting</p>
            <p className="mt-1 text-sm text-muted-foreground">Set up Autopilot and Zenex will place the best ideas here with clear dates.</p>
            <Button asChild variant="outline" className="mt-5"><Link href={`/dashboard/blogs/${blogId}/autopilot`}>Set up Autopilot</Link></Button>
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {items.map(item => {
              const working = pending && activeItem === item.id;
              const style = STATUS_STYLE[item.status as keyof typeof STATUS_STYLE] || STATUS_STYLE.planned;
              const stateLabel = working || item.status === "generating"
                ? "Writing now…"
                : item.post
                  ? item.post.status === "published" ? "Published automatically" : "Draft ready"
                  : item.status === "failed"
                    ? "Needs attention"
                    : item.scheduledFor
                      ? "Scheduled"
                      : "Ready when you are";
              const generationText = item.post
                ? item.runs[0]?.completedAt ? `Completed ${scheduledLabel(item.runs[0].completedAt)}` : "Completed"
                : item.scheduledFor ? scheduledLabel(item.scheduledFor) : "When you click Write now";
              const publicationText = item.post?.status === "published"
                ? item.post.publishedAt ? `Published ${scheduledLabel(item.post.publishedAt)}` : "Published"
                : item.post
                  ? "Waiting for your review"
                  : publishingMode === "auto_publish" && item.scheduledFor
                    ? "Automatically after generation"
                    : "After your review";
              return (
                <article key={item.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", style)}>
                        {item.scheduledFor && !item.post && item.status === "planned" && <CalendarClock className="size-3" />}
                        {stateLabel}
                      </span>
                      {item.source === "discovery" && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">Chosen by Zenex</span>}
                      <span className="text-xs uppercase text-muted-foreground">{item.language}</span>
                      {item.intent && <span className="text-xs capitalize text-muted-foreground">{item.intent}</span>}
                    </div>
                    <h3 className="font-medium">{item.post?.title || item.title || item.primaryKeyword}</h3>
                    {item.post?.title && <p className="text-sm text-muted-foreground">Target: {item.primaryKeyword}</p>}
                    {item.rationale && <p className="max-w-2xl text-sm text-muted-foreground">{item.rationale}</p>}
                    {item.opportunitySnapshot?.metrics && (
                      <p className="text-xs text-muted-foreground">
                        {typeof item.opportunitySnapshot.metrics.searchVolume === "number" && <>Monthly searches: {item.opportunitySnapshot.metrics.searchVolume.toLocaleString()}</>}
                        {typeof item.opportunitySnapshot.metrics.searchVolume === "number" && typeof item.opportunitySnapshot.metrics.difficulty === "number" && " · "}
                        {typeof item.opportunitySnapshot.metrics.difficulty === "number" && <>Difficulty: {item.opportunitySnapshot.metrics.difficulty}</>}
                      </p>
                    )}
                    <div className="mt-3 grid max-w-2xl gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2">
                        <Clock3 className="mt-0.5 size-3.5 shrink-0" />
                        <p><span className="block font-medium text-foreground">Generation</span>{generationText}</p>
                      </div>
                      <div className="flex items-start gap-2 rounded-md bg-muted/40 px-3 py-2">
                        <Send className="mt-0.5 size-3.5 shrink-0" />
                        <p><span className="block font-medium text-foreground">Publication</span>{publicationText}</p>
                      </div>
                    </div>
                    {(item.lastError || item.runs[0]?.error) && <p className="max-w-2xl text-sm text-destructive">{item.lastError || item.runs[0]?.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {item.post ? (
                      <Button asChild variant="outline"><Link href={`/dashboard/blogs/${blogId}/posts/${item.post.id}/edit`}><Check />{item.post.status === "published" ? "View article" : "Review draft"}</Link></Button>
                    ) : (
                      <Button onClick={() => generate(item.id)} disabled={pending || !aiReady} variant={item.scheduledFor ? "outline" : "default"}>
                        {working ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                        {item.status === "failed" ? "Try again" : "Write now"}
                      </Button>
                    )}
                    {!item.post && item.status !== "generating" && (
                      <Button variant="ghost" size="icon" onClick={() => remove(item.id)} disabled={pending} aria-label={`Remove ${item.primaryKeyword}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <details className="group rounded-xl border bg-card">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium">Add an idea manually <span className="font-normal text-muted-foreground">· optional</span></summary>
        <div className="border-t px-5 py-5">
          <form onSubmit={add} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
              <div className="grid gap-1.5">
                <Label htmlFor="keyword">Article idea</Label>
                <Input id="keyword" name="keyword" placeholder="e.g. best CRM for freelancers" required minLength={3} maxLength={160} disabled={pending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="plan-language">Language</Label>
                <Select value={language} onValueChange={setLanguage} disabled={pending}>
                  <SelectTrigger id="plan-language" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{languages.map(item => <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <details className="group rounded-md border bg-muted/20 px-3">
              <summary className="cursor-pointer list-none py-2.5 text-sm text-muted-foreground">Optional guidance</summary>
              <div className="grid gap-4 border-t py-4">
                <div className="grid gap-1.5"><Label htmlFor="title">Preferred title</Label><Input id="title" name="title" placeholder="Leave blank and Zenex will choose" disabled={pending} /></div>
                <div className="grid gap-1.5"><Label htmlFor="notes">Anything it should include?</Label><Textarea id="notes" name="notes" rows={3} placeholder="Examples, opinions, product context or points to avoid" disabled={pending} /></div>
              </div>
            </details>
            <div className="flex justify-end"><Button type="submit" disabled={pending}><Plus />Add to queue</Button></div>
          </form>
        </div>
      </details>
    </div>
  );
}
