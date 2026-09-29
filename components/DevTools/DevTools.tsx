"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EyeOff, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEV_TOOLS } from "./tools";

type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const CORNERS: Corner[] = ["bottom-right", "bottom-left", "top-left", "top-right"];
const CORNER_CLASS: Record<Corner, string> = {
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
};
const STORAGE = { corner: "zenex-devtools-corner", hiddenUntil: "zenex-devtools-hidden-until" };
const HIDE_FOR_MS = 5 * 60 * 1000;
const DRAG_THRESHOLD = 4;

/** Preferences live in localStorage, read through an external store so SSR and hydration agree. */
const listeners = new Set<() => void>();
function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage unavailable: preferences reset on reload */ }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}
const snapshot = () => `${read(STORAGE.corner) ?? ""}|${read(STORAGE.hiddenUntil) ?? ""}`;
const serverSnapshot = () => "|";

/** Floating dev-only toolbox, like Vercel's toolbar. Rendered only when NODE_ENV is development. */
export function DevTools() {
  const [savedCorner, savedHidden] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split("|");
  const corner: Corner = CORNERS.includes(savedCorner as Corner) ? savedCorner as Corner : "bottom-right";
  const hiddenUntil = Number(savedHidden) || 0;
  const [open, setOpen] = useState(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  // Reappear once the hide period is over (immediately if it already expired).
  useEffect(() => {
    if (!hiddenUntil) return;
    const timeout = setTimeout(() => write(STORAGE.hiddenUntil, null), Math.max(0, hiddenUntil - Date.now()));
    return () => clearTimeout(timeout);
  }, [hiddenUntil]);

  const moveTo = (next: Corner) => write(STORAGE.corner, next);

  function hide() {
    setOpen(false);
    write(STORAGE.hiddenUntil, String(Date.now() + HIDE_FOR_MS));
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startY: event.clientY, moved: false };
  }
  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < DRAG_THRESHOLD) return;
    state.moved = true;
    setOpen(false);
    setDragPosition({ x: event.clientX, y: event.clientY });
  }
  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    drag.current = null;
    setDragPosition(null);
    if (!state?.moved) { setOpen((value) => !value); return; }
    const vertical = event.clientY < window.innerHeight / 2 ? "top" : "bottom";
    const horizontal = event.clientX < window.innerWidth / 2 ? "left" : "right";
    moveTo(`${vertical}-${horizontal}` as Corner);
  }

  if (hiddenUntil) return null;

  const top = corner.startsWith("top");
  const left = corner.endsWith("left");

  return (
    <div className={cn("fixed z-[9999]", !dragPosition && CORNER_CLASS[corner])} style={dragPosition ? { left: dragPosition.x - 20, top: dragPosition.y - 20 } : undefined}>
      {open && (
        <div
          className={cn(
            "absolute w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl",
            top ? "top-12" : "bottom-12",
            left ? "left-0" : "right-0",
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Dev tools</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={hide} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <EyeOff className="size-3.5" /> Hide 5 min
              </button>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="divide-y rounded-lg border bg-card">
            {DEV_TOOLS.map(({ id, title, component: Tool }) => (
              <section key={id} className="grid gap-2 p-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
                <Tool />
              </section>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Position</span>
            <div className="grid grid-cols-2 gap-1">
              {(["top-left", "top-right", "bottom-left", "bottom-right"] as Corner[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Move to ${item}`}
                  onClick={() => moveTo(item)}
                  className={cn("size-3 rounded-sm border", item === corner ? "border-foreground bg-foreground" : "hover:bg-accent")}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label="Dev tools"
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={cn(
          "flex size-10 touch-none select-none items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105",
          dragPosition ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <Wrench className="size-4" />
      </button>
    </div>
  );
}
