"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBlog } from "@/src/server/services/blogs/mutations";
import { toast } from "sonner";
import { useUnsavedChanges } from "@/components/UnsavedChanges/UnsavedChangesProvider";

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

  const { markSaved } = useUnsavedChanges({ value: name.trim(), save: persist, enabled: canEdit });

  async function persist() {
    const nextName = name.trim();
    if (!nextName) { toast.error("Enter a blog name"); return false; }
    setPending(true);
    const result = await updateBlog(blogId, { name: nextName });
    setPending(false);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    markSaved();
    toast.success("Blog name saved");
    router.refresh();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() && name.trim() !== initialName) await persist();
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
      {!canEdit && <p className="text-xs text-muted-foreground">Only blog admins can change the name.</p>}
    </form>
  );
}
