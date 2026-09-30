"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** App-wide toasts (sonner), in the app's popover colors for light and dark mode. */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      className="toaster group"
      style={{
        "--normal-bg": "rgb(var(--popover))",
        "--normal-text": "rgb(var(--popover-foreground))",
        "--normal-border": "rgb(var(--border))",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties}
      toastOptions={{ classNames: { toast: "text-sm shadow-lg", description: "text-muted-foreground" } }}
      {...props}
    />
  );
}

export { Toaster };
