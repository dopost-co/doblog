"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import type { ApiScope } from "@/lib/integrations/scopes";
import { revokeMcpConnection, updateMcpConnection } from "@/src/server/services/mcp-connections/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ScopeChecklist } from "./ScopeChecklist";

type Connection = {
  id: string; clientName: string; clientUri: string | null; scopes: string[];
  blogs: { id: string; name: string }[]; createdAt: string; revokedAt: string | null; lastUsedAt: string | null;
};

const date = (value: string) => new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
const host = (uri: string | null) => {
  if (!uri) return null;
  try { return new URL(uri).host; } catch { return null; }
};

export function McpConnectionsManager({ blogId, connections }: { blogId: string; connections: Connection[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Connection | null>(null);
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [revoking, setRevoking] = useState<Connection | null>(null);
  const [error, setError] = useState("");

  function edit(connection: Connection) {
    setError("");
    setScopes(connection.scopes as ApiScope[]);
    setEditing(connection);
  }

  function save() {
    if (!editing) return;
    setError("");
    startTransition(async () => {
      const result = await updateMcpConnection(blogId, editing.id, { scopes });
      if (result.error) { setError(result.error); return; }
      setEditing(null);
      router.refresh();
    });
  }

  function revoke() {
    if (!revoking) return;
    setError("");
    startTransition(async () => {
      const result = await revokeMcpConnection(blogId, revoking.id);
      if (result.error) { setError(result.error); return; }
      setRevoking(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Connected clients</h2>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="whitespace-nowrap border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Permissions</th>
              <th className="px-4 py-2 font-medium">Connected</th>
              <th className="px-4 py-2 font-medium">Last used</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="w-12 px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {connections.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No clients connected yet</td></tr>
            ) : connections.map((connection) => {
              const active = !connection.revokedAt;
              const otherBlogs = connection.blogs.filter((blog) => blog.id !== blogId);
              return (
                <tr
                  key={connection.id}
                  onClick={active ? () => edit(connection) : undefined}
                  className={cn(active ? "cursor-pointer hover:bg-accent/40" : "text-muted-foreground")}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{connection.clientName}</div>
                    {(() => {
                      const detail = [host(connection.clientUri), otherBlogs.length ? `Also ${otherBlogs.map((blog) => blog.name).join(", ")}` : null].filter(Boolean).join(" · ");
                      return detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null;
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {connection.scopes.map((scope) => <span key={scope} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{scope}</span>)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{date(connection.createdAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{connection.lastUsedAt ? date(connection.lastUsedAt) : "Never"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs", active && "text-emerald-700 dark:text-emerald-400")}>
                      <span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                      {active ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    {active && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${connection.clientName}`} disabled={pending}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => edit(connection)}>Edit permissions</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => { setError(""); setRevoking(connection); }}>Revoke</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error && !editing && !revoking && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !pending) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.clientName}</DialogTitle>
            <DialogDescription>
              Connected {editing && date(editing.createdAt)} · Last used {editing?.lastUsedAt ? date(editing.lastUsedAt) : "never"}.
              {" "}Changes apply to the client’s next request.
            </DialogDescription>
          </DialogHeader>
          <ScopeChecklist value={scopes} onChange={setScopes} disabled={pending} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={pending}
              onClick={() => { const connection = editing; setEditing(null); setRevoking(connection); }}
            >
              Revoke access
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" disabled={pending} onClick={() => setEditing(null)}>Cancel</Button>
              <Button disabled={pending || scopes.length === 0} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revoking} onOpenChange={(open) => { if (!open && !pending) setRevoking(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.clientName}?</DialogTitle>
            <DialogDescription>The client loses access to every blog it was connected to. To use it again, connect it again.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={revoke}>{pending ? "Revoking…" : "Revoke access"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
