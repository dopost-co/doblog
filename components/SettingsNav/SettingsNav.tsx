"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Providers, Usage and Billing belong to the owner's account, so only the owner sees them. */
export function SettingsNav({ blogId, showAccount }: { blogId: string; showAccount: boolean }) {
  const pathname = usePathname();
  const basePath = `/dashboard/blogs/${blogId}/settings`;
  const items = [
    { href: basePath, label: "General" },
    { href: `${basePath}/members`, label: "Members" },
    { href: `${basePath}/authors`, label: "Authors" },
    { href: `${basePath}/categories`, label: "Categories" },
    { href: `${basePath}/web-integration`, label: "Web integration" },
    ...(showAccount ? [
      { href: `${basePath}/providers`, label: "Providers" },
      { href: `${basePath}/usage`, label: "Usage" },
      { href: `${basePath}/billing`, label: "Billing" },
    ] : []),
  ];

  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto lg:mx-0 lg:flex-col">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
