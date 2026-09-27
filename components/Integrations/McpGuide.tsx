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
              <p className="mt-1 text-sm text-muted-foreground">Use the hosted MCP endpoint. Compatible clients open a secure OAuth consent screen and keep access through rotating refresh tokens.</p>
            </div>
          </div>

          <div className="space-y-2">
            <CopyRow label="MCP server URL" value={endpoint} />
          </div>

          <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" /> 1. Add the URL</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Paste the endpoint into a remote MCP client.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> 2. Approve access</div>
              <p className="text-xs leading-relaxed text-muted-foreground">Sign in, select the blog and review the requested permissions.</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" /> 3. Stay connected</div>
              <p className="text-xs leading-relaxed text-muted-foreground">The client refreshes access automatically. Edit or revoke it below at any time.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="https://modelcontextprotocol.io/docs/tutorials/use-remote-mcp-server" target="_blank">How remote MCP works <ExternalLink /></Link>
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
            {["content:read", "content:write", "media:write", "seo:write"].map((scope) => (
              <code key={scope} className="rounded-full bg-muted px-2.5 py-1 text-xs">{scope}</code>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This supports drafts, images and editorial settings. Add publish or delete only when the client really needs them.</p>
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
          <p className="text-sm text-muted-foreground">The stdio bridge uses an API key because local stdio clients cannot complete the hosted OAuth flow. Create one only for this fallback.</p>
          <Button variant="outline" size="sm" asChild><Link href={dashboardId ? `/dashboard/blogs/${dashboardId}/api-keys` : "/dashboard"}>Open API keys</Link></Button>
          <DocsCodeBlock language="json" code={stdioConfig(origin)} filename="mcpServers configuration" />
        </div>
      </details>

      <p className="text-xs leading-relaxed text-muted-foreground">
        OAuth is recommended. Keep fallback API keys out of prompts, repositories and browser bundles. Writes are draft-first unless the connection also has publish permission.
      </p>
    </div>
  );
}
