import Link from "next/link";
import { cn } from "@/lib/utils";

/** Underlined tabs that navigate between views of a page. */
export function LinkTabs({ items, active }: {
  items: { id: string; label: string; href: string }[];
  active: string;
}) {
  return (
    <nav className="flex gap-6 border-b">
      {items.map((item) => {
        const selected = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 pb-2.5 text-sm transition-colors",
              selected ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
