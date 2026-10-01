"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { countRefreshableCoversAction, refreshCoversAction } from "@/src/server/services/growth/actions";
import type { CoverRefreshScope } from "@/src/server/services/growth/cover-refresh";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Redraws every cover this blog generated with the saved thumbnail settings,
 * for articles written before the settings or the template changed.
 *
 * The confirmation names how many articles it would redraw and whether that
 * spends AI credits, because the work is paid for and cannot be undone.
 */
export function RefreshCoversDialog({ blogId, usesAi, disabled }: {
  blogId: string;
  /** Whether redrawing spends AI credits (brand cards without illustration do not). */
  usesAi: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Required<Omit<CoverRefreshScope, "limit">>>({
    includeMissing: false, includeManual: false,
  });
  const [count, setCount] = useState<number | null>(null);
  const [counting, startCounting] = useTransition();
  const [pending, startRefresh] = useTransition();

  function recount(next: CoverRefreshScope) {
    setCount(null);
    startCounting(async () => {
      const result = await countRefreshableCoversAction(blogId, next);
      if ("error" in result) { toast.error(result.error); setOpen(false); return; }
      setCount(result.count);
    });
  }

  function openDialog() {
    setOpen(true);
    recount(scope);
  }

  function toggleScope(key: keyof typeof scope, checked: boolean) {
    const next = { ...scope, [key]: checked };
    setScope(next);
    recount(next);
  }

  function refresh() {
    startRefresh(async () => {
      const result = await refreshCoversAction(blogId, scope);
      if ("error" in result) { toast.error(result.error); return; }
      setOpen(false);
      if (result.queued === 0) { toast.info("There are no generated covers to redraw."); return; }
      toast.success(
        result.delivery === "queue"
          ? `Redrawing ${result.queued} ${result.queued === 1 ? "cover" : "covers"}. They update as each one finishes.`
          : `Redrawing ${result.queued} ${result.queued === 1 ? "cover" : "covers"} in the background.`,
      );
      if (result.failed) toast.warning(`${result.failed} could not be queued and were left unchanged.`);
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={disabled} onClick={openDialog}>
        <RefreshCw />Redraw all covers
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redraw every cover?</DialogTitle>
            <DialogDescription>
              {counting || count === null
                ? "Counting the articles this would affect…"
                : count === 0
                  ? scope.includeMissing || scope.includeManual
                    ? "There are no articles left to draw a cover for."
                    : "No article has a cover generated here yet. Tick a box below to also cover the rest of your articles."
                  : `${count} ${count === 1 ? "article gets its cover" : "articles get their covers"} drawn with your saved thumbnail settings.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="redraw-include-missing"
                checked={scope.includeMissing}
                disabled={pending}
                onCheckedChange={(checked) => toggleScope("includeMissing", checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor="redraw-include-missing" className="grid gap-1 font-normal">
                <span>Also cover articles that have no image</span>
                <span className="text-xs text-muted-foreground">
                  Off, only covers generated here are redrawn.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="redraw-include-manual"
                checked={scope.includeManual}
                disabled={pending}
                onCheckedChange={(checked) => toggleScope("includeManual", checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor="redraw-include-manual" className="grid gap-1 font-normal">
                <span>Also replace covers you set by hand</span>
                <span className="text-xs text-muted-foreground">
                  Articles not written by Autopilot or whose cover you uploaded yourself. Their current cover is replaced.
                </span>
              </Label>
            </div>
            {count ? (
              <ul className="grid gap-2 text-sm text-muted-foreground">
                <li>It uses your <strong>saved</strong> settings, so save any change on this page first.</li>
                {usesAi && <li>Each cover spends AI credits and takes around 20 seconds, so this is slow and paid for.</li>}
                {scope.includeManual
                  ? <li>Covers you set by hand are <strong>replaced</strong> too, and the article no longer points at the old one.</li>
                  : <li>Covers you uploaded yourself are left alone; only the ones generated here are replaced.</li>}
                <li>Articles are queued one at a time and update as each finishes. You can close this page.</li>
              </ul>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={refresh} disabled={pending || counting || !count}>
              {pending && <LoaderCircle className="animate-spin" />}
              {pending ? "Queueing…" : count ? `Draw ${count}` : "Draw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
