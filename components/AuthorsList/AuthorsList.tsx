"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditAuthorDialog } from "@/components/EditAuthorDialog/EditAuthorDialog";
import { MoreHorizontal } from "lucide-react";
import { deleteAuthor } from "@/src/server/services/authors/mutations";

interface Author {
  id: string;
  name: string;
  email: string;
  slug: string;
  bio: string | null;
}

interface AuthorsListProps {
  authors: Author[];
  blogId: string;
}

export function AuthorsList({ authors, blogId }: AuthorsListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleDelete(authorId: string, authorName: string) {
    if (!confirm(`Are you sure you want to delete ${authorName}?`)) {
      return;
    }

    setError("");
    setDeletingId(authorId);

    try {
      const result = await deleteAuthor(authorId);

      if (result.error) {
        setError(result.error);
        setDeletingId(null);
      } else {
        setDeletingId(null);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete author");
      setDeletingId(null);
    }
  }

  if (authors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        No authors yet. Add your first author to get started.
      </div>
    );
  }

  return (
    <>
      <div className="divide-y rounded-lg border bg-card">
        {authors.map((author) => (
          <div key={author.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {author.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{author.name}</p>
              <p className="truncate text-xs text-muted-foreground">{author.email}</p>
            </div>
            <EditAuthorDialog
              author={author}
              blogId={blogId}
              open={editingId === author.id}
              onOpenChange={(open) => setEditingId(open ? author.id : null)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${author.name}`} disabled={deletingId === author.id || editingId === author.id}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditingId(author.id)}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDelete(author.id, author.name)}
                  disabled={deletingId === author.id}
                  className="text-destructive focus:text-destructive"
                >
                  {deletingId === author.id ? "Deleting..." : "Delete"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </>
  );
}
