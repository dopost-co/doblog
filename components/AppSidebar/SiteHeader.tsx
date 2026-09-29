"use client";

import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./SidebarProvider";

const SECTION_TITLES: [segment: string, title: string][] = [
  ["calendar", "Calendar"],
  ["settings", "Settings"],
  ["autopilot", "Autopilot"],
  ["seo", "Autopilot"],
  ["mcp", "MCP"],
  ["api-keys", "API keys"],
];

export function SiteHeader({ blogId, blogName }: { blogId: string; blogName: string }) {
  const pathname = usePathname();
  const { toggle } = useSidebar();
  const segment = pathname.replace(`/dashboard/blogs/${blogId}`, "").split("/")[1] || "";
  const title = SECTION_TITLES.find(([key]) => key === segment)?.[1] ?? "Posts";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 lg:px-6">
      <Button variant="ghost" size="icon-sm" className="-ml-2 size-7" onClick={toggle} aria-label="Toggle sidebar">
        <PanelLeft />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="hidden truncate text-muted-foreground sm:inline">{blogName}</span>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <span className="truncate font-medium">{title}</span>
      </nav>
    </header>
  );
}
