"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type EditorJS from "@editorjs/editorjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { normalizeLinkUrl } from "./link-url";
import { EDIT_LINK_EVENT, linkInRange } from "./link-tool";

export function LinkEditorDialog({ holderRef, editorRef }: {
  holderRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<EditorJS | null>;
}) {
  const id = useId();
  const targetRef = useRef<HTMLAnchorElement | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const [existing, setExisting] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    function showDialog(anchor: HTMLAnchorElement | null, range: Range | null) {
      const node = anchor || range?.commonAncestorContainer;
      const element = node instanceof Element ? node : node?.parentElement;
      const editable = element?.closest<HTMLElement>('[contenteditable="true"]');
      if (!editable || !holder!.contains(editable)) return;
      targetRef.current = anchor;
      rangeRef.current = range;
      returnFocusRef.current = editable;
      setExisting(Boolean(anchor));
      editorRef.current?.inlineToolbar.close();
      setText(anchor?.textContent || range?.toString() || "");
      setUrl(anchor?.getAttribute("href") || "");
      setError("");
      setOpen(true);
    }
    function fromToolbar(event: Event) {
      const range = (event as CustomEvent<Range>).detail;
      if (!(range instanceof Range)) return;
      showDialog(linkInRange(range), range);
    }
    function editLink(event: MouseEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent && event.key !== "Enter") return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      // Link preview cards and images retain their own tools.
      if (!anchor || !anchor.isContentEditable || !holder!.contains(anchor)) return;
      event.preventDefault();
      event.stopPropagation();
      showDialog(anchor, null);
    }
    holder.addEventListener(EDIT_LINK_EVENT, fromToolbar);
    holder.addEventListener("click", editLink, true);
    holder.addEventListener("keydown", editLink, true);
    return () => {
      holder.removeEventListener(EDIT_LINK_EVENT, fromToolbar);
      holder.removeEventListener("click", editLink, true);
      holder.removeEventListener("keydown", editLink, true);
    };
  }, [holderRef, editorRef]);

  function update(remove = false) {
    const anchor = targetRef.current;
    const range = rangeRef.current;
    const node = anchor || range?.commonAncestorContainer;
    if (!node || !holderRef.current?.contains(node)) {
      setError("This link has changed. Close this dialog and select it again.");
      return;
    }
    const href = normalizeLinkUrl(url);
    if (!remove && (!text.trim() || !href)) {
      setError(!text.trim() ? "Enter the link text." : "Enter a valid URL, email link, phone link or page path.");
      return;
    }
    const element = node instanceof HTMLElement ? node : node.parentElement;
    const block = element ? editorRef.current?.blocks.getBlockByElement(element) : undefined;
    if (remove && anchor) {
      anchor.replaceWith(...Array.from(anchor.childNodes));
    } else if (anchor) {
      anchor.setAttribute("href", href!);
      // Preserve existing inline formatting when only the destination changes.
      if (text !== anchor.textContent) anchor.textContent = text;
    } else if (range) {
      const link = document.createElement("a");
      link.setAttribute("href", href!);
      if (text === range.toString()) {
        const content = range.extractContents();
        // Never nest anchors when the selected text includes another link.
        content.querySelectorAll("a").forEach((child) => child.replaceWith(...Array.from(child.childNodes)));
        link.append(content);
      } else {
        range.deleteContents();
        link.textContent = text;
      }
      range.insertNode(link);
    }
    block?.dispatchChange();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm" onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      }}>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); update(); }}>
          <DialogHeader>
            <DialogTitle>{existing ? "Edit link" : "Add link"}</DialogTitle>
            <DialogDescription className="sr-only">Change the text and destination of this link.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-text`}>Text</Label>
            <Input id={`${id}-text`} value={text} onChange={(event) => setText(event.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-url`}>URL</Label>
            <Input id={`${id}-url`} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" autoComplete="off" spellCheck={false} aria-describedby={error ? `${id}-error` : undefined} />
          </div>
          {error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            {existing && <Button type="button" variant="ghost" onClick={() => update(true)}>Remove link</Button>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
