"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocsCodeBlock } from "@/components/Docs/DocsCodeBlock";
import { stdioConfig } from "@/lib/integrations/examples";

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const serverOrigin = () => "https://your-cms.example";

export function McpGuide({ dashboardId }: { dashboardId?: string }) {
  const origin = useSyncExternalStore(subscribe, getOrigin, serverOrigin);
  const endpoint = `${origin}/api/mcp`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-medium">Server URL</h2>
          <p className="text-sm text-muted-foreground">
            Add it to any client that supports remote MCP. You’ll sign in, choose the blog and approve what the client can do.
          </p>
        </div>
        <div className="flex max-w-xl gap-2">
          <Input aria-label="MCP server URL" value={endpoint} readOnly className="font-mono text-sm" onFocus={(event) => event.currentTarget.select()} />
          <Button variant="outline" size="icon" onClick={copy} aria-label="Copy MCP server URL">{copied ? <Check /> : <Copy />}</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Access renews automatically. Writes are saved as drafts unless the client can publish.
          {dashboardId && <>{" "}<Link href="/docs/mcp" className="text-foreground underline underline-offset-4">MCP documentation</Link></>}
        </p>
      </section>

      <details className="group border-t pt-4">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          Client only supports local stdio?
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Local stdio clients can’t complete the sign-in, so the bridge uses an API key instead. Create one only for this, and keep it out of prompts and repositories.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href={dashboardId ? `/dashboard/blogs/${dashboardId}/api-keys` : "/dashboard"}>Open API keys</Link>
          </Button>
          <DocsCodeBlock language="json" code={stdioConfig(origin)} filename="mcpServers configuration" />
        </div>
      </details>
    </div>
  );
}
