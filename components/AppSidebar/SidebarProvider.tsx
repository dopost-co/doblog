"use client";

import { createContext, useCallback, useContext, useState } from "react";

export const SIDEBAR_COOKIE = "sidebar_state";

interface SidebarContextValue {
  open: boolean;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within SidebarProvider");
  return context;
}

export function SidebarProvider({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggle = useCallback(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((value) => !value);
      return;
    }
    setOpen((value) => {
      document.cookie = `${SIDEBAR_COOKIE}=${!value}; path=/; max-age=${60 * 60 * 24 * 365}`;
      return !value;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ open, mobileOpen, setMobileOpen, toggle }}>
      <div data-sidebar-open={open} className="group/shell flex min-h-svh w-full bg-sidebar text-sidebar-foreground">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
