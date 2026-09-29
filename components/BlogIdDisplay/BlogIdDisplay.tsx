"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BlogIdDisplayProps {
  blogId: string;
}

export function BlogIdDisplay({ blogId }: BlogIdDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(blogId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="blog-id">Blog ID</Label>
        <p className="text-sm text-muted-foreground">
          Public identifier for published content, not a secret. Manage private access in API keys.
        </p>
      </div>
      <div className="flex gap-2">
        <Input id="blog-id" value={blogId} readOnly className="font-mono" />
        <Button onClick={handleCopy} variant="outline">
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
