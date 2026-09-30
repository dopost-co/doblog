"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MoreHorizontal, Plus } from "lucide-react";
import type { ApiScope } from "@/lib/integrations/scopes";
import { createApiKey, revokeApiKey } from "@/src/server/services/api-keys/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ScopeChecklist } from "./ScopeChecklist";
import { toast } from "sonner";

type KeyInfo = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; expiresAt: string | null; neverExpires: boolean; revokedAt: string | null; lastUsedAt: string | null; expired: boolean };

const EXPIRATIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];
const DEFAULT_SCOPES: ApiScope[] = ["content:read", "content:write"];
const date = (value: string) => new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export function CreateApiKeyDialog({ blogId }: { blogId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [expiration, setExpiration] = useState("90");
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_SCOPES);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setName(""); setExpiration("90"); setScopes(DEFAULT_SCOPES); setToken(null); setCopied(false); setError("");
  }

  function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const neverExpires = expiration === "never";
        const result = await createApiKey(blogId, { name, scopes, neverExpires, ...(neverExpires ? {} : { expiresInDays: Number(expiration) }) });
        if (result.error) { setError(result.error); toast.error(result.error); return; }
        setToken(result.token ?? null);
        toast.success("API key created", { description: "Copy it now: it won’t be shown again." });
        router.refresh();
      } catch { setError("Unable to create the key. Try again."); toast.error("Unable to create the key. Try again."); }
    });
  }

  async function copy() {
    if (!token) return;
    try { await navigator.clipboard.writeText(token); setCopied(true); toast.success("API key copied"); } catch { setError("Clipboard unavailable. Select and copy the key manually."); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (pending) return; setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus /> New key</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {token ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your key</DialogTitle>
              <DialogDescription>It won’t be shown again. Store it in your client’s secret storage.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input aria-label="New API key" value={token} readOnly className="font-mono text-xs" autoComplete="off" spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy API key" onClick={copy}>{copied ? <Check /> : <Copy />}</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button onClick={() => { setOpen(false); reset(); }}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={create} className="grid gap-5">
            <DialogHeader><DialogTitle>New API key</DialogTitle></DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <div className="grid gap-2">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" placeholder="Editorial assistant" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required disabled={pending} autoFocus />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="key-expiration">Expires</Label>
                <Select value={expiration} onValueChange={setExpiration} disabled={pending}>
                  <SelectTrigger id="key-expiration" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPIRATIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <ScopeChecklist value={scopes} onChange={setScopes} disabled={pending} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !name.trim() || scopes.length === 0}>{pending ? "Creating…" : "Create key"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysTable({ blogId, keys }: { blogId: string; keys: KeyInfo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [revoking, setRevoking] = useState<KeyInfo | null>(null);
  const [error, setError] = useState("");

  function revoke() {
    if (!revoking) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await revokeApiKey(blogId, revoking.id);
        if (result.error) { setError(result.error); toast.error(result.error); return; }
        toast.success(`${revoking.name} revoked`);
        setRevoking(null);
        router.refresh();
      } catch { setError("Unable to revoke the key. Try again."); toast.error("Unable to revoke the key. Try again."); }
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Permissions</th>
              <th className="px-4 py-2 font-medium">Expires</th>
              <th className="px-4 py-2 font-medium">Last used</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="w-12 px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No API keys yet</td></tr>
            ) : keys.map((key) => {
              const inactive = Boolean(key.revokedAt) || key.expired;
              const status = key.revokedAt ? "Revoked" : key.expired ? "Expired" : "Active";
              return (
                <tr key={key.id} className={cn(inactive && "text-muted-foreground")}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{key.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{key.prefix}…</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {key.scopes.map((scope) => <span key={scope} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{scope}</span>)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{key.neverExpires ? "Never" : key.expiresAt ? date(key.expiresAt) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{key.lastUsedAt ? date(key.lastUsedAt) : "Never"}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 text-xs", !inactive && "text-emerald-700 dark:text-emerald-400")}>
                      <span className={cn("size-1.5 rounded-full", inactive ? "bg-muted-foreground/50" : "bg-emerald-500")} />
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!inactive && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${key.name}`} disabled={pending}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem variant="destructive" onSelect={() => setRevoking(key)}>Revoke</DropdownMenuItem>
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
      {keys.length === 100 && <p className="text-xs text-muted-foreground">Showing the 100 most recent keys.</p>}
      {error && !revoking && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Dialog open={!!revoking} onOpenChange={(open) => { if (!open && !pending) setRevoking(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
            <DialogDescription>Connected clients will lose access. This cannot be undone.</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setRevoking(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={revoke}>{pending ? "Revoking…" : "Revoke key"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
