"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formSnapshot, inAppDestination, snapshot } from "@/lib/unsaved-changes";

/**
 * Warns before leaving a page with unsaved changes. Forms register with
 * useUnsavedChanges; links inside the app, and navigation wrapped in
 * useConfirmLeave, then ask first with a toast at the top: save and go,
 * leave without saving, or stay. Reloading or closing the tab can only use
 * the browser's own dialog.
 */
type Guard = { isDirty: () => boolean; save: () => Promise<boolean> };
type UnsavedChanges = {
  register: (id: string, guard: Guard) => () => void;
  confirmLeave: (proceed: () => void) => void;
};

const Context = createContext<UnsavedChanges | null>(null);
const TOAST_ID = "unsaved-changes";

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const guards = useRef(new Map<string, Guard>());
  const dirtyGuards = useCallback(() => [...guards.current.values()].filter((guard) => guard.isDirty()), []);

  const confirmLeave = useCallback((proceed: () => void) => {
    const dirty = dirtyGuards();
    if (!dirty.length) { proceed(); return; }
    const leave = () => { toast.dismiss(TOAST_ID); proceed(); };
    toast.custom(() => (
      <UnsavedChangesToast
        onSave={async () => {
          for (const guard of dirty) if (!(await guard.save())) return;
          leave();
        }}
        onDiscard={leave}
        onStay={() => toast.dismiss(TOAST_ID)}
      />
    ), { id: TOAST_ID, position: "top-center", duration: Infinity, unstyled: true });
  }, [dirtyGuards]);

  useEffect(() => {
    // Capture phase: runs before Next's <Link> handler, which can then be stopped.
    function onClick(event: MouseEvent) {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = inAppDestination(event, anchor, window.location);
      if (!destination || !dirtyGuards().length) return;
      event.preventDefault();
      event.stopPropagation();
      confirmLeave(() => router.push(destination));
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyGuards().length) return;
      event.preventDefault();
      event.returnValue = "";
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [confirmLeave, dirtyGuards, router]);

  const value = useMemo<UnsavedChanges>(() => ({
    register(id, guard) {
      guards.current.set(id, guard);
      return () => { guards.current.delete(id); };
    },
    confirmLeave,
  }), [confirmLeave]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function UnsavedChangesToast({ onSave, onDiscard, onStay }: {
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div role="alertdialog" aria-label="Unsaved changes" className="flex w-[min(92vw,26rem)] items-center gap-3 rounded-xl border bg-popover p-3 pl-4 text-sm text-popover-foreground shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="font-medium">You have unsaved changes</p>
        <p className="text-xs text-muted-foreground">Save them before leaving?</p>
      </div>
      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onDiscard}>Don&apos;t save</Button>
      <Button
        type="button"
        size="sm"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try { await onSave(); } finally { setSaving(false); }
        }}
      >
        {saving && <LoaderCircle className="animate-spin" />}Save
      </Button>
      <button type="button" aria-label="Stay on this page" disabled={saving} onClick={onStay} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Registers a form with the guard. `value` is the form's state (anything JSON
 * can hold); with `formRef`, uncontrolled fields count too. The form is dirty
 * when either differs from what was there on load or at the last markSaved().
 * `save` saves without navigating and resolves to whether it worked.
 */
export function useUnsavedChanges({ value, save, formRef, enabled = true }: {
  value: unknown;
  save: () => Promise<boolean>;
  formRef?: RefObject<HTMLFormElement | null>;
  enabled?: boolean;
}) {
  const context = useContext(Context);
  const id = useId();
  const current = snapshot(value);
  const latest = useRef(current);
  const baseline = useRef<{ value: string; form: string } | null>(null);
  const saveRef = useRef(save);

  useLayoutEffect(() => {
    latest.current = current;
    saveRef.current = save;
  });

  // Take the initial form snapshot after child controls have run their mount
  // effects. Components such as Radix Select add their form value during that
  // phase; reading in a layout effect made an untouched form look dirty.
  useEffect(() => {
    baseline.current ??= { value: latest.current, form: formSnapshot(formRef?.current) };
  }, [formRef]);

  useEffect(() => {
    if (!context || !enabled) return;
    return context.register(id, {
      isDirty: () => !!baseline.current && (latest.current !== baseline.current.value || formSnapshot(formRef?.current) !== baseline.current.form),
      save: () => saveRef.current(),
    });
  }, [context, enabled, formRef, id]);

  /** Call after saving: the current values become the new baseline. */
  const markSaved = useCallback(() => {
    baseline.current = { value: latest.current, form: formSnapshot(formRef?.current) };
  }, [formRef]);

  return { markSaved };
}

/** Wraps navigation done in code (router.push) so it asks first when there are unsaved changes. */
export function useConfirmLeave() {
  const context = useContext(Context);
  return useCallback((proceed: () => void) => (context ? context.confirmLeave(proceed) : proceed()), [context]);
}
