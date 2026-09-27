"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, KeyRound, Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DocsCodeBlock } from "@/components/Docs/DocsCodeBlock";
import { stdioConfig } from "@/lib/integrations/examples";

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const serverOrigin = () => "https://your-cms.example";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <code className="block truncate text-sm">{value}</code>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function McpGuide({ dashboardId }: { dashboardId?: string }) {
  const origin = useSyncExternalStore(subscribe, getOrigin, serverOrigin);
  const endpoint = `${origin}/api/mcp`;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Link2 className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold">Connect to Zenex</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use the hosted MCP endpoint. No local checkout or server process is required.</p>
            </div>
          </div>

          <div className="space-y-2">
            <CopyRow label="MCP server URL" value={endpoint} />
            <CopyRow label="Authorization header" value="Bearer znx_REPLACE_WITH_YOUR_KEY" />
          </div>

          <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> 1. Create a key</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Choose only the permissions your client needs.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" /> 2. Add the URL</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Select Streamable HTTP and paste the endpoint above.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> 3. Authenticate</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Send your key as a Bearer authorization header.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={dashboardId ? `/dashboard/blogs/${dashboardId}/api-keys` : "/dashboard"}>Open API keys</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/docs/mcp">MCP documentation <ExternalLink /></Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Recommended permissions</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {["content:read", "content:write"].map((scope) => (
              <code key={scope} className="rounded-full bg-muted px-2.5 py-1 text-xs">{scope}</code>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Add publish or delete permissions only when the client really needs them.</p>
        </section>
        <section className="rounded-lg border p-5">
          <h3 className="text-sm font-semibold">Quick test</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Ask your client to call <code className="text-foreground">get_blog</code>, then <code className="text-foreground">list_posts</code>.</p>
        </section>
      </div>

      <details className="group rounded-lg border">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium">
          Using a client that only supports local stdio?
          <span className="float-right text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="space-y-3 border-t px-5 py-4">
          <p className="text-sm text-muted-foreground">Use the local bridge only when your client cannot connect to a remote Streamable HTTP server.</p>
          <DocsCodeBlock language="json" code={stdioConfig(origin)} filename="mcpServers configuration" />
        </div>
      </details>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Keep API keys out of prompts, repositories and browser bundles. Writes are draft-first unless the key also has publish permission.
      </p>
    </div>
  );
}
