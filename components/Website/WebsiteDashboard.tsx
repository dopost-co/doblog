"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ExternalLink, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getLanguageName } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { copiesArticles, destinationName, isCodePlatform, platformName, DELIVERY_METHODS } from "@/lib/publishing/platforms";
import {
  chooseSitePlatform, disconnectDestination, resendAllArticles, retryPublication, syncDestinationNow,
} from "@/src/server/services/publishing/actions";
import type { WebsiteState } from "@/src/server/services/publishing/queries";
import { DeliveryMethodCards, SitePlatformCards } from "./PlatformPicker";
import { ApiReadingPanel, ConnectPanel } from "./ConnectPanel";

const ago = (value: string | null) => value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : null;

/** A settings block: title and description on top, then its content, like the other Settings tabs. */
function Section({ title, description, children, actions }: { title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Picking (or changing) the kind of website and, for sites built in code, how articles arrive. */
function ChooseWebsite({ blogId, current, onDone, onCancel }: {
  blogId: string; current: { platform: string; method: string } | null; onDone: () => void; onCancel?: () => void;
}) {
  const [platform, setPlatform] = useState<string | null>(current?.platform ?? null);
  const [method, setMethod] = useState<string | null>(current && isCodePlatform(current.platform) ? current.method : "github");
  const [pending, startTransition] = useTransition();
  const code = isCodePlatform(platform);

  function save() {
    if (!platform) return;
    startTransition(async () => {
      const result = await chooseSitePlatform(blogId, platform as never, (code ? method : null) as never);
      if ("error" in result && result.error) { toast.error(result.error); return; }
      onDone();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm font-medium">What website do you have?</h2>
        <SitePlatformCards value={platform} onChange={setPlatform} disabled={pending} />
      </div>
      {code && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
          <h2 className="text-sm font-medium">How should articles reach it?</h2>
          <DeliveryMethodCards value={method} onChange={setMethod} disabled={pending} />
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending || !platform || (code && !method)}>
          {pending ? <><Loader2 className="animate-spin" /> Saving…</> : "Continue"}
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "ok" | "busy" | "error" | "idle" }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", {
    ok: "bg-emerald-500", busy: "bg-amber-500 animate-pulse", error: "bg-destructive", idle: "bg-muted-foreground/40",
  }[status])} />;
}

export function WebsiteDashboard({ state, canManage, canWrite }: { state: WebsiteState; canManage: boolean; canWrite: boolean }) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [pending, startTransition] = useTransition();
  const destination = state.destination;
  const counts = "counts" in state ? state.counts : null;
  const busy = Boolean(destination?.syncing || (counts && counts.waiting > 0 && destination?.status === "connected"));

  // While articles are on their way, keep the numbers fresh.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 3 * 60_000) clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [busy, router]);

  const run = (action: () => Promise<{ error?: string } | object>, success: string) => startTransition(async () => {
    const result = await action();
    if ("error" in result && result.error) toast.error(result.error);
    else { toast.success(success); router.refresh(); }
  });

  if (!destination || changing) {
    if (!canManage) {
      return <div className="divide-y"><Section title="Your website" description="Not set up yet. An admin of this blog chooses where its articles are published." /></div>;
    }
    return (
      <div className="divide-y">
        <Section title="Your website" description="Zenex publishes your articles there and keeps them up to date.">
          <ChooseWebsite blogId={state.blogId} current={destination} onDone={() => { setChanging(false); router.refresh(); }} onCancel={destination ? () => setChanging(false) : undefined} />
        </Section>
      </div>
    );
  }

  const name = destinationName(destination);
  const pushes = copiesArticles(destination.method);
  const methodTitle = DELIVERY_METHODS.find((method) => method.id === destination.method)?.title;
  const where = destination.siteUrl?.replace(/^https?:\/\//, "") ?? destination.github?.repo ?? null;
  const connected = destination.status === "connected";
  const details = [
    destination.info.platformVersion && `${platformName(destination.platform)} ${destination.info.platformVersion}`,
    destination.info.seoPlugin && { yoast: "Yoast SEO", rankmath: "Rank Math", seopress: "SEOPress", aioseo: "All in One SEO" }[destination.info.seoPlugin],
    destination.info.multilingual && destination.platform === "wordpress" && "Polylang",
  ].filter(Boolean).join(" · ");

  const header = (
    <Section
      title={
        <span className="flex items-center gap-2">
          <StatusDot status={!pushes ? "ok" : connected ? (busy ? "busy" : "ok") : destination.status === "error" ? "error" : "idle"} />
          {platformName(destination.platform)}
          {isCodePlatform(destination.platform) && methodTitle && <span className="font-normal text-muted-foreground">· {methodTitle.toLowerCase()}</span>}
        </span>
      }
      description={!pushes ? "Your site reads articles from Zenex."
        : connected ? <>Connected{where ? <> to <span className="text-foreground">{where}</span></> : null}{details ? ` · ${details}` : ""}</>
          : destination.status === "error" ? "Connection lost." : "Not connected yet."}
      actions={canManage && (
        <Button variant="outline" size="sm" onClick={() => (connected && pushes ? setConfirmChange(true) : setChanging(true))}>Change</Button>
      )}
    />
  );

  const changeDialog = (
    <Dialog open={confirmChange} onOpenChange={setConfirmChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stop publishing to {where ?? name}?</DialogTitle>
          <DialogDescription>
            Articles already on {where ?? "your site"} stay there, but Zenex will no longer update or remove them. You can connect it again later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Keep it</Button></DialogClose>
          <Button variant="outline" onClick={() => { setConfirmChange(false); setChanging(true); }}>Choose another website</Button>
          <Button variant="destructive" disabled={pending} onClick={() => { setConfirmChange(false); run(() => disconnectDestination(state.blogId), "Disconnected"); }}>Disconnect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!pushes) {
    return (
      <div className="divide-y">
        {header}
        <Section title="Reading articles">
          <ApiReadingPanel blogId={state.blogId} publicBlogId={state.publicBlogId} platform={destination.platform} />
        </Section>
      </div>
    );
  }

  const connect = (
    <ConnectPanel
      blogId={state.blogId}
      website={state.website}
      destination={{
        platform: destination.platform, method: destination.method, siteUrl: destination.siteUrl, status: destination.status,
        statusMessage: destination.statusMessage, endpoint: destination.endpoint, github: destination.github,
      }}
    />
  );

  if (!connected) {
    return (
      <div className="divide-y">
        {header}
        {changeDialog}
        {destination.status === "error" && destination.statusMessage && (
          <Section title="Problem">
            <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">Zenex can’t publish to {name} right now</p>
                <p className="text-muted-foreground">{destination.statusMessage} New and updated articles wait here and are sent once the connection works again.</p>
              </div>
            </div>
          </Section>
        )}
        {canManage
          ? <Section title="Connect" description="Published articles are copied to your site and stay there, even if you stop using Zenex.">{connect}</Section>
          : <Section title="Connect" description="Not connected yet. An admin of this blog needs to finish connecting the site." />}
      </div>
    );
  }

  const languages = destination.languages.map((code) => getLanguageName(code) ?? code);
  const skipped = state.blogLanguages.filter((code) => !destination.languages.includes(code));

  return (
    <div className="divide-y">
      {header}
      {changeDialog}
      <Section
        title="Articles"
        description={<>Publishing an article in Zenex copies it to {where ?? name}; editing or unpublishing it updates the copy.{destination.lastSyncedAt ? ` Last sync ${ago(destination.lastSyncedAt)}.` : ""}</>}
        actions={canWrite && (
          <Button variant="outline" size="sm" disabled={pending || busy} onClick={() => run(() => syncDestinationNow(state.blogId), "Sync started")}>
            {busy ? <><Loader2 className="animate-spin" /> Syncing…</> : <><RefreshCw /> Sync now</>}
          </Button>
        )}
      >
        {counts && (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div><dt className="text-muted-foreground">On your site</dt><dd className="text-2xl font-semibold tabular-nums">{counts.synced}</dd></div>
            <div><dt className="text-muted-foreground">On their way</dt><dd className="text-2xl font-semibold tabular-nums">{counts.waiting}</dd></div>
            <div><dt className="text-muted-foreground">Failed</dt><dd className={cn("text-2xl font-semibold tabular-nums", counts.failed > 0 && "text-destructive")}>{counts.failed}</dd></div>
          </dl>
        )}
        {skipped.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Only {languages.join(", ")} articles are sent.{" "}
            {destination.platform === "wordpress"
              ? "Install Polylang on WordPress to publish every language, then check the connection again."
              : destination.platform === "prestashop"
                ? `Add ${skipped.map((code) => getLanguageName(code) ?? code).join(", ")} in PrestaShop (International → Localization → Languages), then check the connection again.`
                : null}
          </p>
        )}
        {"failures" in state && state.failures.length > 0 && (
          <ul className="divide-y rounded-lg border bg-card">
            {state.failures.map((failure) => (
              <li key={failure.postId} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">{failure.title}</p>
                  <p className="text-xs text-destructive">{failure.error}</p>
                  <p className="text-xs text-muted-foreground">Zenex tries again on its own; retry now once the problem is fixed.</p>
                </div>
                {canWrite && <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => retryPublication(state.blogId, failure.postId), "Trying again")}><RotateCcw /> Retry</Button>}
              </li>
            ))}
          </ul>
        )}
        {"recent" in state && state.recent.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Recently sent</p>
            <ul className="space-y-1.5">
              {state.recent.map((item) => (
                <li key={item.postId} className="flex items-center justify-between gap-3 text-sm">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
                    <span className="truncate">{item.title}</span> <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(item.syncedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
      {canManage && <Section title="Connection">{connect}</Section>}
      {canManage && (
        <Section
          title="Send again"
          description={<>If articles were deleted on {where ?? "your site"} by hand, this puts them back.{languages.length ? ` Languages sent: ${languages.join(", ")}.` : ""}</>}
          actions={<Button variant="outline" size="sm" disabled={pending || busy} onClick={() => run(() => resendAllArticles(state.blogId), "Sending every article again")}>Send every article</Button>}
        />
      )}
    </div>
  );
}
