"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBlog } from "@/src/server/services/blogs/mutations";
import { toast } from "sonner";

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

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === initialName) return;
    setPending(true);
    const result = await updateBlog(blogId, { name: nextName });
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Blog name saved");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Label htmlFor="blog-name">Blog name</Label>
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
    </form>
  );
}
