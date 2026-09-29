"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBlog } from "@/src/server/services/blogs/mutations";

export function BlogNameSettings({
  blogId,
  initialName,
  canEdit,
}: {
  blogId: string;
  initialName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === initialName) return;
    setPending(true);
    setMessage("");
    setError("");
    const result = await updateBlog(blogId, { name: nextName });
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Blog name updated.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="blog-name">Blog name</Label>
        <p className="text-sm text-muted-foreground">Shown in your blog list and in the sidebar.</p>
      </div>
      <div className="flex gap-2">
        <Input
          id="blog-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEdit || pending}
          maxLength={120}
        />
        {canEdit && <Button type="submit" variant="outline" disabled={pending || !name.trim() || name.trim() === initialName}>{pending ? "Saving…" : "Save"}</Button>}
      </div>
      {!canEdit && <p className="text-xs text-muted-foreground">Only the blog owner can change this name.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
    </form>
  );
}
