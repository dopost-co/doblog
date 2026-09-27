"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Blog name</CardTitle>
        <CardDescription>This is the name shown in your blog list and dashboard navigation.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="blog-name">Name</Label>
              <Input
                id="blog-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!canEdit || pending}
                maxLength={120}
              />
            </div>
            {canEdit && <Button type="submit" disabled={pending || !name.trim() || name.trim() === initialName}>{pending ? "Saving…" : "Save"}</Button>}
          </div>
          {!canEdit && <p className="text-xs text-muted-foreground">Only the blog owner can change this name.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
