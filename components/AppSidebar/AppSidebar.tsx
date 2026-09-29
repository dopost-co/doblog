"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BookOpen,
  CalendarDays,
  Check,
  ChevronsUpDown,
  FileText,
  KeyRound,
  LayoutGrid,
  LogOut,
  Moon,
  Plug,
  Settings,
  Sun,
  TrendingUp,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarProvider";

interface AppSidebarProps {
  blog: { id: string; name: string };
  blogs: { id: string; name: string }[];
  user: { name?: string | null; email?: string | null };
}

function initials(value: string) {
  return value.trim().charAt(0).toUpperCase() || "?";
}

export function AppSidebar(props: AppSidebarProps) {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 transition-transform duration-200 ease-linear group-data-[sidebar-open=false]/shell:-translate-x-full md:flex">
        <SidebarContent {...props} />
      </aside>
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 md:hidden" />
          <DialogPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left fixed inset-y-0 left-0 z-50 flex w-72 bg-sidebar text-sidebar-foreground shadow-lg duration-200 md:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <SidebarContent {...props} onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

function SidebarContent({ blog, blogs, user, onNavigate }: AppSidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const basePath = `/dashboard/blogs/${blog.id}`;

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href || pathname.startsWith(`${href}/posts`) : pathname === href || pathname.startsWith(`${href}/`);

  const groups = [
    {
      label: "Content",
      items: [
        { href: basePath, label: "Posts", icon: FileText, active: isActive(basePath, true) },
        { href: `${basePath}/calendar`, label: "Calendar", icon: CalendarDays, active: isActive(`${basePath}/calendar`) },
        { href: `${basePath}/seo`, label: "Growth / SEO", icon: TrendingUp, active: isActive(`${basePath}/seo`) },
      ],
    },
    {
      label: "Developers",
      items: [
        { href: `${basePath}/mcp`, label: "MCP", icon: Plug, active: isActive(`${basePath}/mcp`) },
        { href: `${basePath}/api-keys`, label: "API keys", icon: KeyRound, active: isActive(`${basePath}/api-keys`) },
      ],
    },
  ];

  return (
    <div className="flex h-full w-full flex-col gap-2 p-2">
      <BlogSwitcher blog={blog} blogs={blogs} onNavigate={onNavigate} />

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pt-2">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
            {group.items.map((item) => (
              <SidebarLink key={item.href} {...item} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5">
        <SidebarLink
          href={`${basePath}/settings`}
          label="Settings"
          icon={Settings}
          active={isActive(`${basePath}/settings`)}
          onNavigate={onNavigate}
        />
        <SidebarLink href="/docs" label="Docs" icon={BookOpen} active={false} onNavigate={onNavigate} />
      </div>

      <UserMenu user={user} />
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-foreground/80 hover:bg-accent/70 hover:text-accent-foreground"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function BlogSwitcher({ blog, blogs, onNavigate }: Pick<AppSidebarProps, "blog" | "blogs"> & { onNavigate?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-12 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          {initials(blog.name)}
        </span>
        <span className="grid flex-1 leading-tight">
          <span className="truncate text-sm font-semibold">{blog.name}</span>
          <span className="truncate text-xs text-muted-foreground">Blog</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Blogs</DropdownMenuLabel>
        {blogs.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={`/dashboard/blogs/${item.id}`} onClick={onNavigate} className="gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border text-xs">
                {initials(item.name)}
              </span>
              <span className="flex-1 truncate">{item.name}</span>
              {item.id === blog.id && <Check className="size-4" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" onClick={onNavigate} className="gap-2">
            <LayoutGrid className="size-4" />
            All blogs
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: Pick<AppSidebarProps, "user">) {
  const { resolvedTheme, setTheme } = useTheme();
  const email = user.email || "";
  const name = user.name || email.split("@")[0] || "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-12 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
          {initials(name)}
        </span>
        <span className="grid flex-1 leading-tight">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="gap-2">
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectTo: "/" })} className="gap-2">
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
