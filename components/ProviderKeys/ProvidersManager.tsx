"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addDataForSeoConnection, removeOpenAiKey, saveOpenAiKey } from "@/src/server/services/providers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ProviderSettings = {
  plan: "lifetime" | "subscription";
  openai: { hint: string | null };
  dataForSeo: { id: string; label: string; loginHint: string; verifiedAt: string | null }[];
};

function Row({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function ProvidersManager({ settings }: { settings: ProviderSettings }) {
  if (settings.plan === "subscription") {
    return (
      <div className="divide-y rounded-lg border bg-card">
        <Row title="OpenAI" description="Included in your plan" />
        <Row title="DataForSEO" description="Included in your plan" />
      </div>
    );
  }
  return (
    <div className="divide-y rounded-lg border bg-card">
      <OpenAiRow hint={settings.openai.hint} />
      <DataForSeoRow connections={settings.dataForSeo} />
    </div>
  );
}

function OpenAiRow({ hint }: { hint: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await saveOpenAiKey(key);
      if (result.error) { setError(result.error); return; }
      setOpen(false); setKey(""); router.refresh();
    });
  }

  return (
    <Row title="OpenAI" description={hint ? `Connected · ${hint}` : "Used for translations and AI features"}>
      {hint && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => startTransition(async () => { await removeOpenAiKey(); router.refresh(); })}>
          Remove
        </Button>
      )}
      <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(""); } }}>
        <DialogTrigger asChild><Button variant="outline" size="sm">{hint ? "Replace" : "Connect"}</Button></DialogTrigger>
        <DialogContent>
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader><DialogTitle>OpenAI API key</DialogTitle></DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="openai-key">Key</Label>
              <Input id="openai-key" type="password" autoComplete="off" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} disabled={pending} autoFocus />
              <p className="text-xs text-muted-foreground">Stored encrypted. Usage is billed to your OpenAI account.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="submit" disabled={pending || !key.trim()}>{pending ? "Verifying…" : "Save"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Row>
  );
}

function DataForSeoRow({ connections }: { connections: ProviderSettings["dataForSeo"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await addDataForSeoConnection({ label: form.get("label"), login: form.get("login"), password: form.get("password") });
      if (result.error) { setError(result.error); return; }
      setOpen(false); router.refresh();
    });
  }

  const description = connections.length === 0 ? "Used for keyword and SERP research"
    : connections.map((item) => `${item.label} · ${item.loginHint}`).join(", ");

  return (
    <Row title="DataForSEO" description={description}>
      <Dialog open={open} onOpenChange={(next) => { if (!pending) { setOpen(next); setError(""); } }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">{connections.length ? <><Plus /> Add</> : "Connect"}</Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={add} className="grid gap-4">
            <DialogHeader><DialogTitle>DataForSEO connection</DialogTitle></DialogHeader>
            <div className="grid gap-1.5"><Label htmlFor="dfs-label">Name</Label><Input id="dfs-label" name="label" defaultValue="DataForSEO" required maxLength={80} disabled={pending} /></div>
            <div className="grid gap-1.5"><Label htmlFor="dfs-login">API login</Label><Input id="dfs-login" name="login" autoComplete="off" required disabled={pending} /></div>
            <div className="grid gap-1.5">
              <Label htmlFor="dfs-password">API password</Label>
              <Input id="dfs-password" name="password" type="password" autoComplete="new-password" required disabled={pending} />
              <p className="text-xs text-muted-foreground">Verified and stored encrypted. Never shared with MCP clients or members.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter><Button type="submit" disabled={pending}>{pending ? "Verifying…" : "Connect"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Row>
  );
}
