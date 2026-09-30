"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateBlogLanguages } from "@/src/server/services/blogs/mutations";
import { BlogLanguagesPicker } from "./BlogLanguagesPicker";
import { toast } from "sonner";

export function BlogLanguagesSettings({ blogId, initialLanguages, initialAutoSync, canEdit }: {
  blogId: string;
  initialLanguages: string[];
  initialAutoSync: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState({ languages: initialLanguages, autoSync: initialAutoSync });
  const [languages, setLanguages] = useState(initialLanguages);
  const [autoSync, setAutoSync] = useState(initialAutoSync);
  const [pending, setPending] = useState(false);

  const multilingual = languages.length > 1;
  const effectiveAutoSync = multilingual && autoSync;
  const changed = languages.join() !== saved.languages.join() || effectiveAutoSync !== saved.autoSync;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await updateBlogLanguages(blogId, { languages, autoSyncTranslations: effectiveAutoSync });
    setPending(false);
    if ("error" in result && result.error) { toast.error(result.error); return; }
    if (result.success) {
      setSaved({ languages: result.languages, autoSync: result.autoSyncTranslations });
      toast.success("Languages saved");
      router.refresh();
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 border-t pt-6">
      <div className="space-y-1">
        <Label>Languages</Label>
        <p className="text-sm text-muted-foreground">The first one is the main language. Autopilot writes in it.</p>
      </div>
      <BlogLanguagesPicker value={languages} onChange={setLanguages} disabled={!canEdit || pending} />
      {multilingual && (
        <label className="flex items-start justify-between gap-4">
          <span className="grid gap-1">
            <span className="text-sm font-medium">Translate automatically</span>
            <span className="text-sm text-muted-foreground">
              When a post is created or updated, the rest of its translation group is translated from it, and missing languages are added.
            </span>
          </span>
          <Switch checked={autoSync} onCheckedChange={setAutoSync} disabled={!canEdit || pending} />
        </label>
      )}
      {canEdit ? (
        <Button type="submit" variant="outline" disabled={pending || !changed}>{pending ? "Saving…" : "Save"}</Button>
      ) : (
        <p className="text-xs text-muted-foreground">Only the blog owner can change the languages.</p>
      )}
    </form>
  );
}
