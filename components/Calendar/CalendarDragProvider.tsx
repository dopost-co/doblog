"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { CalendarDropTarget, CalendarEntry } from "./calendar-utils";

const ACTIVE_TARGET_CLASSES = ["bg-primary/10", "ring-2", "ring-inset", "ring-primary/30"] as const;
const DRAG_ACTIVATION_DISTANCE = 4;
const DRAG_FOLLOW_FACTOR = 0.42;
const DRAG_SETTLE_DISTANCE = 0.5;
const AUTO_SCROLL_EDGE = 72;
const AUTO_SCROLL_MAX_SPEED = 22;

interface DropTargetElement {
  element: HTMLElement;
  target: CalendarDropTarget;
}

interface DragSession {
  entry: CalendarEntry;
  source: HTMLElement;
  sourceWidth: number;
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  overlayX: number;
  overlayY: number;
  smoothMovement: boolean;
  active: boolean;
  onActivated?: () => void;
  onFinished?: () => void;
}

interface CalendarDragContextValue {
  beginDrag: (
    event: ReactPointerEvent<HTMLElement>,
    entry: CalendarEntry,
    callbacks?: { onActivated?: () => void; onFinished?: () => void },
  ) => void;
}

const CalendarDragContext = createContext<CalendarDragContextValue | null>(null);

function readDropTarget(x: number, y: number): DropTargetElement | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-calendar-drop-zone="true"]') ?? null;
  const date = element?.dataset.calendarDate;
  if (!element || !date) return null;
  const rawHour = element.dataset.calendarHour;
  const hour = rawHour === undefined ? undefined : Number(rawHour);
  if (hour !== undefined && (!Number.isInteger(hour) || hour < 0 || hour > 23)) return null;
  return { element, target: hour === undefined ? { date } : { date, hour } };
}

function getScrollContainer(x: number, y: number): HTMLElement | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const container = element.closest<HTMLElement>("[data-calendar-scroll-container]");
    if (container) return container;
  }
  return null;
}

function getAutoScrollSpeed(container: HTMLElement, pointerY: number): number {
  const rect = container.getBoundingClientRect();
  if (pointerY < rect.top + AUTO_SCROLL_EDGE) {
    return -Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, (rect.top + AUTO_SCROLL_EDGE - pointerY) / AUTO_SCROLL_EDGE));
  }
  if (pointerY > rect.bottom - AUTO_SCROLL_EDGE) {
    return Math.ceil(AUTO_SCROLL_MAX_SPEED * Math.min(1, (pointerY - (rect.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE));
  }
  return 0;
}

/** Pointer-based drag and drop, adapted from the dopost calendar. */
export function CalendarDragProvider({
  children,
  onDrop,
  renderOverlay,
}: {
  children: ReactNode;
  onDrop: (input: { entry: CalendarEntry; target: CalendarDropTarget }) => void | Promise<void>;
  renderOverlay: (entry: CalendarEntry) => ReactNode;
}) {
  const [overlayEntry, setOverlayEntry] = useState<CalendarEntry | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const targetRef = useRef<DropTargetElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const clearTarget = useCallback(() => {
    targetRef.current?.element.classList.remove(...ACTIVE_TARGET_CLASSES);
    targetRef.current = null;
  }, []);

  const setTargetAtPointer = useCallback((x: number, y: number) => {
    const nextTarget = readDropTarget(x, y);
    if (nextTarget?.element === targetRef.current?.element) return;
    clearTarget();
    if (!nextTarget) return;
    nextTarget.element.classList.add(...ACTIVE_TARGET_CLASSES);
    targetRef.current = nextTarget;
  }, [clearTarget]);

  const positionOverlay = useCallback((): boolean => {
    const session = sessionRef.current;
    const overlay = overlayRef.current;
    if (!session?.active || !overlay) return false;
    overlay.style.width = `${session.sourceWidth}px`;
    const deltaX = session.x - session.overlayX;
    const deltaY = session.y - session.overlayY;
    const isSettled = Math.abs(deltaX) <= DRAG_SETTLE_DISTANCE && Math.abs(deltaY) <= DRAG_SETTLE_DISTANCE;
    if (!session.smoothMovement || isSettled) {
      session.overlayX = session.x;
      session.overlayY = session.y;
    } else {
      session.overlayX += deltaX * DRAG_FOLLOW_FACTOR;
      session.overlayY += deltaY * DRAG_FOLLOW_FACTOR;
    }
    overlay.style.transform = `translate3d(${session.overlayX}px, ${session.overlayY}px, 0)`;
    return session.smoothMovement && !isSettled;
  }, []);

  const runAnimationFrame = useCallback(function run() {
    animationFrameRef.current = null;
    const session = sessionRef.current;
    if (!session?.active) return;
    let shouldContinue = positionOverlay();
    setTargetAtPointer(session.x, session.y);
    const scrollContainer = getScrollContainer(session.x, session.y);
    if (scrollContainer) {
      const speed = getAutoScrollSpeed(scrollContainer, session.y);
      if (speed !== 0) {
        const previousScrollTop = scrollContainer.scrollTop;
        scrollContainer.scrollTop += speed;
        shouldContinue ||= scrollContainer.scrollTop !== previousScrollTop;
      }
    }
    if (shouldContinue) animationFrameRef.current = requestAnimationFrame(run);
  }, [positionOverlay, setTargetAtPointer]);

  const scheduleAnimationFrame = useCallback(() => {
    if (animationFrameRef.current === null) animationFrameRef.current = requestAnimationFrame(runAnimationFrame);
  }, [runAnimationFrame]);

  const finishDrag = useCallback((cancelled: boolean, x?: number, y?: number) => {
    const session = sessionRef.current;
    if (!session) return;
    if (x !== undefined && y !== undefined && session.active) {
      session.x = x;
      session.y = y;
      setTargetAtPointer(x, y);
    }
    const completedTarget = cancelled || !session.active ? null : targetRef.current;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    clearTarget();
    session.source.classList.remove("opacity-25");
    document.body.style.removeProperty("user-select");
    document.body.style.removeProperty("cursor");
    sessionRef.current = null;
    setOverlayEntry(null);
    if (session.active) window.setTimeout(() => session.onFinished?.(), 0);
    if (completedTarget) {
      void Promise.resolve(onDropRef.current({ entry: session.entry, target: completedTarget.target }))
        .catch((error) => console.error("Calendar drop failed:", error));
    }
  }, [clearTarget, setTargetAtPointer]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      session.x = event.clientX;
      session.y = event.clientY;
      if (!session.active) {
        if (Math.hypot(event.clientX - session.originX, event.clientY - session.originY) < DRAG_ACTIVATION_DISTANCE) return;
        session.active = true;
        session.source.classList.add("opacity-25");
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
        session.onActivated?.();
        setOverlayEntry(session.entry);
      }
      event.preventDefault();
      scheduleAnimationFrame();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === sessionRef.current?.pointerId) finishDrag(false, event.clientX, event.clientY);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (event.pointerId === sessionRef.current?.pointerId) finishDrag(true);
    };
    const handleWindowBlur = () => finishDrag(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishDrag(true);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeyDown);
      finishDrag(true);
    };
  }, [finishDrag, scheduleAnimationFrame]);

  useLayoutEffect(() => {
    positionOverlay();
  }, [overlayEntry, positionOverlay]);

  const beginDrag = useCallback<CalendarDragContextValue["beginDrag"]>((event, entry, callbacks) => {
    if (event.button !== 0 || event.pointerType === "touch" || sessionRef.current) return;
    sessionRef.current = {
      entry,
      source: event.currentTarget,
      sourceWidth: event.currentTarget.getBoundingClientRect().width,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      overlayX: event.clientX,
      overlayY: event.clientY,
      smoothMovement: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      active: false,
      onActivated: callbacks?.onActivated,
      onFinished: callbacks?.onFinished,
    };
  }, []);

  const contextValue = useMemo(() => ({ beginDrag }), [beginDrag]);

  return (
    <CalendarDragContext.Provider value={contextValue}>
      {children}
      {overlayEntry && createPortal(
        <div ref={overlayRef} className="pointer-events-none fixed left-0 top-0 z-[100] will-change-transform">
          <div className="rotate-1 shadow-2xl">{renderOverlay(overlayEntry)}</div>
        </div>,
        document.body,
      )}
    </CalendarDragContext.Provider>
  );
}

export function useCalendarDrag() {
  const context = useContext(CalendarDragContext);
  if (!context) throw new Error("useCalendarDrag must be used within CalendarDragProvider");
  return context;
}

export function CalendarDropZone({
  target,
  disabled = false,
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { target: CalendarDropTarget; disabled?: boolean }) {
  return (
    <div
      data-calendar-drop-zone={disabled ? undefined : "true"}
      data-calendar-date={target.date}
      data-calendar-hour={target.hour}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}
