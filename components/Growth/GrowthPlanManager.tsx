"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { languages } from "@/lib/languages";
import { addPlanItemAction, generatePlanItemAction, removePlanItemAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PlanItem = {
  id: string;
  primaryKeyword: string;
  title: string | null;
  language: string;
  intent: string | null;
  source: string;
  rationale: string | null;
  notes: string | null;
  secondaryKeywords: string[];
  opportunitySnapshot: {
    priority?: string;
    metrics?: { searchVolume?: number | null; difficulty?: number | null; source?: string; competitorUrl?: string } | null;
  } | null;
  status: string;
  scheduledFor: string | null;
  lastError: string | null;
  createdAt: string;
  post: { id: string; title: string; status: string; coverImage: string | null; publishedAt: string | null; translationSyncPending: boolean } | null;
  /** Translations of the written article, in the blog's other languages. */
  translations: Array<{ id: string; language: string; status: string }>;
  runs: Array<{ id: string; status: string; stage: string; error: string | null; createdAt: string; completedAt: string | null }>;
};

const PRIORITY_LABEL: Record<string, string> = { high: "High priority", medium: "Medium priority", low: "Low priority" };

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** The search research behind an idea: what it targets and why the numbers say it's worth it. */
function IdeaResearch({ item }: { item: PlanItem }) {
  const metrics = item.opportunitySnapshot?.metrics;
  const priority = item.opportunitySnapshot?.priority;
  const competitor = metrics?.source === "competitor_gap" && metrics.competitorUrl ? hostOf(metrics.competitorUrl) : null;
  const facts = [
    priority && PRIORITY_LABEL[priority],
    typeof metrics?.searchVolume === "number" && `${metrics.searchVolume.toLocaleString()} searches/month`,
    typeof metrics?.difficulty === "number" && `Difficulty ${metrics.difficulty}/100`,
  ].filter(Boolean);
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{item.source === "manual" ? "Topic:" : "Keyword:"}</span> {item.primaryKeyword}
      </p>
      {item.secondaryKeywords.length > 0 && <p><span className="font-medium text-foreground">Keywords:</span> {item.secondaryKeywords.join(", ")}</p>}
      {(facts.length > 0 || competitor || !metrics) && (
        <p>
          {facts.join(" · ")}
          {competitor && <>{facts.length > 0 && " · "}Won by <a href={metrics!.competitorUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">{competitor}</a></>}
          {!metrics && item.source === "discovery" && <>{facts.length > 0 && " · "}No search data</>}
        </p>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  planned: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  generating: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
} as const;

/** The draft is saved before its images, so the run, not the post, says when it is done. */
function isInProgress(item: PlanItem) {
  return item.status === "generating" || item.runs[0]?.status === "queued" || item.runs[0]?.status === "running";
}

/** What a run in progress is doing, from its stage. */
function progressLabel(stage: string | undefined) {
  if (!stage || stage === "queued") return "Queued…";
  if (stage === "images") return "Creating images…";
  return "Writing text…";
}

const scheduledLabel = (value: string) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(value));

/**
 * The languages an idea ends up in: written in the main one, then translated
 * into each of translateTo once the article exists.
 */
function LanguageBadges({ blogId, item, translateTo, inProgress }: { blogId: string; item: PlanItem; translateTo: string[]; inProgress: boolean }) {
  translateTo = translateTo.filter((language) => language !== item.language);
  const main = <span className="text-xs font-medium uppercase text-muted-foreground">{item.language}</span>;
  if (!translateTo.length) return main;
  if (!item.post) {
    return (
      <span className="text-xs uppercase text-muted-foreground" title="Written in the main language, then translated automatically">
        {item.language} <span aria-hidden>→</span> {translateTo.join(" · ")}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs uppercase text-muted-foreground">
      {main}
      {translateTo.map((language) => {
        const translation = item.translations.find((entry) => entry.language === language);
        if (translation) {
          return (
            <Link key={language} href={`/dashboard/blogs/${blogId}/posts/${translation.id}/edit`} className="inline-flex items-center gap-0.5 rounded px-1 hover:bg-muted" title={`${language.toUpperCase()} translation (${translation.status})`}>
              <Check className="size-3 text-emerald-600" />{language}
            </Link>
          );
        }
        const translating = inProgress || item.post!.translationSyncPending;
        return (
          <span key={language} className={cn("inline-flex items-center gap-0.5 normal-case", !translating && "text-amber-700 dark:text-amber-300")}>
            {translating ? <LoaderCircle className="size-3 animate-spin" /> : null}
            <span className="uppercase">{language}</span> {translating ? "translating…" : "not translated"}
          </span>
        );
      })}
    </span>
  );
}

export function GrowthPlanManager({ blogId, items, defaultLanguage, aiReady, mediaReady, publishingMode, canEdit = true, translateTo = [] }: {
  blogId: string;
  /** With auto-sync on, the blog's other languages each article is translated into. */
  translateTo?: string[];
  /** Viewers see the ideas and their progress without adding, writing or removing. */
  canEdit?: boolean;
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
  const translationLanguages = translateTo.filter((code) => code !== language);
  const languageName = (code: string) => languages.find((entry) => entry.code === code)?.name || code.toUpperCase();
  const [adding, setAdding] = useState(false);
  // Only for the add dialog, next to the form; everything else is a toast.
  const [addError, setAddError] = useState("");

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setAddError("");
    startTransition(async () => {
      const result = await addPlanItemAction(blogId, {
        keyword: String(data.get("keyword") || ""), language,
        title: String(data.get("title") || "").trim() || undefined,
        notes: String(data.get("notes") || "").trim() || undefined,
        keywords: String(data.get("keywords") || "").split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
      });
      if (result.error) return setAddError(result.error);
      form.reset();
      setAdding(false);
      toast.success("Idea added to the queue");
      router.refresh();
    });
  }

  function generate(itemId: string) {
    setActiveItem(itemId);
    startTransition(async () => {
      const result = await generatePlanItemAction(blogId, itemId);
      setActiveItem(null);
      if (result.error) toast.error(result.error);
      else toast.success("Writing started", { description: "It continues in the background. You can keep working." });
      router.refresh();
    });
  }

  // Drafts are written in the background; refresh until none is in progress.
  // Keep refreshing while articles are written or their translations are still being made.
  const writing = items.some((item) => isInProgress(item) || (translateTo.length > 0 && Boolean(item.post?.translationSyncPending)));

  // Tell the owner when a background run finishes.
  const inProgressIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const current = new Set(items.filter(isInProgress).map((item) => item.id));
    const previous = inProgressIds.current;
    inProgressIds.current = current;
    if (!previous) return;
    for (const id of previous) {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || current.has(id)) continue;
      const title = item.post?.title || item.title || item.primaryKeyword;
      if (item.status === "failed" || item.runs[0]?.status === "failed") toast.error(`“${title}” could not be written`, { description: item.lastError || item.runs[0]?.error || undefined });
      else if (item.post?.status === "published") toast.success(`“${title}” is published`);
      else if (item.post) toast.success(`“${title}” is ready to review`);
    }
  }, [items]);
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [writing, router]);

  function remove(itemId: string) {
    setActiveItem(itemId);
    startTransition(async () => {
      const result = await removePlanItemAction(blogId, itemId);
      setActiveItem(null);
      if (result.error) toast.error(result.error);
      else toast.success("Idea removed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {!mediaReady && (
        <p className="text-sm text-muted-foreground">Image storage isn’t configured, so articles are written without images.</p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span />
          {canEdit && <Button size="sm" onClick={() => { setAddError(""); setLanguage(defaultLanguage); setAdding(true); }} disabled={pending}><Plus />Add idea</Button>}
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">No ideas yet. New ones appear after the next refresh.</p>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {items.map(item => {
              const working = pending && activeItem === item.id;
              const inProgress = working || isInProgress(item);
              const style = inProgress ? STATUS_STYLE.generating : STATUS_STYLE[item.status as keyof typeof STATUS_STYLE] || STATUS_STYLE.planned;
              const stateLabel = inProgress
                ? progressLabel(working ? "queued" : item.runs[0]?.stage)
                : item.post
                  ? item.post.status === "published" ? "Published automatically" : "Draft ready"
                  : item.status === "failed"
                    ? "Needs attention"
                    : item.scheduledFor
                      ? "Scheduled"
                      : "Ready when you are";
              const generationText = inProgress ? "now" : item.post
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
                        {inProgress && <LoaderCircle className="size-3 animate-spin" />}
                        {item.scheduledFor && !item.post && item.status === "planned" && <CalendarClock className="size-3" />}
                        {stateLabel}
                      </span>
                      <LanguageBadges blogId={blogId} item={item} translateTo={translateTo} inProgress={inProgress} />
                      {item.intent && <span className="text-xs capitalize text-muted-foreground">{item.intent}</span>}
                    </div>
                    <h3 className="font-medium">{item.post?.title || item.title || item.primaryKeyword}</h3>
                    {item.rationale && <p className="max-w-2xl text-sm text-muted-foreground">{item.rationale}</p>}
                    {item.notes && <p className="max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground"><span className="font-medium text-foreground">Brief:</span> {item.notes}</p>}
                    <IdeaResearch item={item} />
                    <p className="text-xs text-muted-foreground">Writing: {generationText} · Publishing: {publicationText}</p>
                    {(item.lastError || item.runs[0]?.error) && <p className="max-w-2xl text-sm text-destructive">{item.lastError || item.runs[0]?.error}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {inProgress ? null : item.post ? (
                      <Button asChild variant="outline"><Link href={`/dashboard/blogs/${blogId}/posts/${item.post.id}/edit`}><Check />{item.post.status === "published" ? "View article" : "Review draft"}</Link></Button>
                    ) : canEdit && (
                      <Button onClick={() => generate(item.id)} disabled={pending || !aiReady} variant={item.scheduledFor ? "outline" : "default"}>
                        {item.status === "failed" ? "Try again" : "Write now"}
                      </Button>
                    )}
                    {canEdit && !item.post && !inProgress && (
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

      <Dialog open={adding} onOpenChange={(open) => { if (!pending) setAdding(open); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={add} className="grid gap-5">
            <DialogHeader>
              <DialogTitle>Add an idea</DialogTitle>
              <DialogDescription>Tell Autopilot what to write. It will shape the title, structure and relevant keywords.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="keyword">What should the article be about?</Label>
              <Input id="keyword" name="keyword" placeholder="How freelancers can choose their first CRM" required minLength={3} maxLength={160} disabled={pending} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="notes">Details & direction <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="notes" name="notes" rows={3} maxLength={1200} placeholder="Who is it for? What should we explain, include or avoid? e.g. Focus on solo freelancers, compare affordable options and include a practical example." disabled={pending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plan-language">Write in</Label>
              <Select value={language} onValueChange={setLanguage} disabled={pending}>
                <SelectTrigger id="plan-language" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{languages.map(item => <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {translationLanguages.length
                  ? `Automatically translated into ${translationLanguages.map(languageName).join(", ")} using your blog’s language settings.`
                  : "One article in this language. Enable automatic translations in your blog’s language settings for more languages."}
              </p>
            </div>
            <details className="group rounded-lg border bg-card px-3 py-2.5">
              <summary className="cursor-pointer text-sm font-medium">Optional keywords & title</summary>
              <div className="grid gap-4 pt-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="keywords">Keywords <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="keywords" name="keywords" placeholder="freelance CRM, client management" maxLength={1222} disabled={pending} aria-describedby="keywords-help" />
                  <p id="keywords-help" className="text-xs text-muted-foreground">Separate with commas, up to 12. Leave blank to let Autopilot choose.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="title">Preferred title <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="title" name="title" minLength={8} maxLength={180} placeholder="Let Autopilot suggest a title" disabled={pending} />
                </div>
              </div>
            </details>
            <p className="text-xs text-muted-foreground">
              {mediaReady ? "Images and thumbnails follow your Autopilot settings." : "Images are unavailable until image storage is configured."}
            </p>
            {addError && <p role="alert" className="text-sm text-destructive">{addError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add idea"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
