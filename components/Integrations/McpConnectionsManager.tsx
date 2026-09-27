"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cable, ShieldCheck } from "lucide-react";
import { API_SCOPES, SCOPE_DESCRIPTIONS, type ApiScope } from "@/lib/integrations/scopes";
import { revokeMcpConnection, updateMcpConnection } from "@/src/server/services/mcp-connections/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Connection = {
  id: string; clientName: string; clientUri: string | null; scopes: string[];
  blogs: { id: string; name: string }[]; createdAt: string; revokedAt: string | null; lastUsedAt: string | null;
};

const displayDate = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";

export function McpConnectionsManager({ blogId, connections }: { blogId: string; connections: Connection[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, ApiScope[]>>(() => Object.fromEntries(connections.map(item => [item.id, item.scopes as ApiScope[]])));
  const [message, setMessage] = useState("");

  const run = (action: () => Promise<{ success?: boolean; error?: string }>) => startTransition(async () => {
    setMessage("");
    const result = await action();
    setMessage(result.error || "Connection updated.");
    if (!result.error) router.refresh();
  });

  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><Cable className="h-5 w-5" />Connected MCP clients</CardTitle>
      <CardDescription>OAuth connections keep their own refresh token. Permission changes apply immediately, without copying or replacing secrets.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}
      {connections.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No OAuth clients are connected to this blog yet. Add the MCP URL to a compatible client and approve the requested access.</p> : connections.map(connection => {
        const scopes = drafts[connection.id] || [];
        const active = !connection.revokedAt;
        return <section key={connection.id} className="space-y-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-medium">{connection.clientName}</h3><p className="mt-1 text-xs text-muted-foreground">{active ? "Active" : "Revoked"} · Last used {displayDate(connection.lastUsedAt)}</p></div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{connection.blogs.map(blog => blog.name).join(", ")}</span>
          </div>
          <fieldset className="grid gap-2 sm:grid-cols-2" disabled={pending || !active}>
            <legend className="sr-only">Permissions for {connection.clientName}</legend>
            {API_SCOPES.map(scope => <label key={scope} className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
              <input type="checkbox" className="mt-1 size-4 accent-foreground" checked={scopes.includes(scope)} onChange={event => setDrafts(current => ({ ...current, [connection.id]: event.target.checked ? [...scopes, scope] : scopes.filter(item => item !== scope) }))} />
              <span><span className="block font-mono text-xs">{scope}</span><span className="mt-1 block text-xs text-muted-foreground">{SCOPE_DESCRIPTIONS[scope]}</span></span>
            </label>)}
          </fieldset>
          {active && <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || scopes.length === 0} onClick={() => run(() => updateMcpConnection(blogId, connection.id, { scopes }))}><ShieldCheck className="mr-2 h-4 w-4" />Save permissions</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => revokeMcpConnection(blogId, connection.id))}>Revoke connection</Button>
          </div>}
        </section>;
      })}
    </CardContent>
  </Card>;
}
