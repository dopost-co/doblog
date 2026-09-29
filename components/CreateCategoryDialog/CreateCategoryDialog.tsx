"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCategory, updateCategory } from "@/src/server/services/categories/mutations";
import { slugify } from "@/lib/slug";
import { Plus } from "lucide-react";

interface CreateCategoryDialogProps {
  blogId: string;
  category?: { id: string; name: string; slug: string; description: string | null };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateCategoryDialog({ blogId, category, open: controlledOpen, onOpenChange }: CreateCategoryDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [manualSlug, setManualSlug] = useState(Boolean(category));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const fields = {
      name,
      slug: slug || slugify(name),
      description: description || undefined,
    };
    const result = category
      ? await updateCategory(category.id, fields)
      : await createCategory({ blogId, ...fields });

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setOpen(false);
      if (!category) {
        setName("");
        setSlug("");
        setDescription("");
        setManualSlug(false);
      }
      setIsLoading(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!category && (
        <DialogTrigger asChild>
          <Button>
            <Plus />
            New category
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "Create new category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!manualSlug) {
                  setSlug(slugify(e.target.value));
                }
              }}
              placeholder="Category name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-slug">Slug</Label>
            <Input
              id="category-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setManualSlug(true);
              }}
              placeholder="category-slug"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-description">Description (optional)</Label>
            <Textarea
              id="category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Category description"
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : category ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
