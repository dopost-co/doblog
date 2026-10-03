"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateCategoryDialog } from "@/components/CreateCategoryDialog/CreateCategoryDialog";
import { deleteCategory } from "@/src/server/services/categories/mutations";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export function CategoriesList({ categories, blogId, canEdit = true }: { categories: Category[]; blogId: string; canEdit?: boolean }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(category: Category) {
    if (!confirm(`Are you sure you want to delete ${category.name}?`)) {
      return;
    }

    setDeletingId(category.id);
    const result = await deleteCategory(category.id);
    setDeletingId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Category deleted");
    router.refresh();
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        No categories yet. Create your first category to get started.
      </div>
    );
  }

  return (
    <>
      <div className="divide-y rounded-lg border bg-card">
        {categories.map((category) => (
          <div key={category.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{category.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {category.description || `/${category.slug}`}
              </p>
            </div>
            {editingId === category.id && (
              <CreateCategoryDialog
                key={category.id}
                blogId={blogId}
                category={category}
                open
                onOpenChange={(open) => !open && setEditingId(null)}
              />
            )}
            {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${category.name}`} disabled={deletingId === category.id}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditingId(category.id)}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDelete(category)}
                  className="text-destructive focus:text-destructive"
                >
                  {deletingId === category.id ? "Deleting..." : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
