"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { countRefreshableCoversAction, refreshCoversAction } from "@/src/server/services/growth/actions";
import { Button } from "@/components/ui/button";
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
  const [count, setCount] = useState<number | null>(null);
  const [counting, startCounting] = useTransition();
  const [pending, startRefresh] = useTransition();

  function openDialog() {
    setOpen(true);
    setCount(null);
    startCounting(async () => {
      const result = await countRefreshableCoversAction(blogId);
      if ("error" in result) { toast.error(result.error); setOpen(false); return; }
      setCount(result.count);
    });
  }

  function refresh() {
    startRefresh(async () => {
      const result = await refreshCoversAction(blogId);
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
                  ? "No article has a cover generated here yet, so there is nothing to redraw."
                  : `${count} ${count === 1 ? "article has its cover" : "articles have their covers"} redrawn with your saved thumbnail settings.`}
            </DialogDescription>
          </DialogHeader>
          {count ? (
            <ul className="grid gap-2 text-sm text-muted-foreground">
              <li>It uses your <strong>saved</strong> settings, so save any change on this page first.</li>
              {usesAi && <li>Each cover spends AI credits and takes around 20 seconds, so this is slow and paid for.</li>}
              <li>Covers you uploaded yourself are left alone; only the ones generated here are replaced.</li>
              <li>Articles are queued one at a time and update as each finishes. You can close this page.</li>
            </ul>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
            </DialogClose>
            <Button type="button" onClick={refresh} disabled={pending || counting || !count}>
              {pending && <LoaderCircle className="animate-spin" />}
              {pending ? "Queueing…" : count ? `Redraw ${count}` : "Redraw"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
