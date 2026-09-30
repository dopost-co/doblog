"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteBlog } from "@/src/server/services/blogs/mutations";

export function DeleteBlog({ blogId, blogName }: { blogId: string; blogName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const matches = confirmation === blogName;

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirmation("");
    setError("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!matches) return;
    setError("");
    startTransition(async () => {
      const result = await deleteBlog(blogId, confirmation);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t border-destructive/30 pt-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <Label>Delete blog</Label>
        <p className="text-sm text-muted-foreground">
          Remove this blog and all of its content from your workspace.
        </p>
      </div>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive">
            <Trash2 /> Delete blog
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={submit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Delete {blogName}?</DialogTitle>
              <DialogDescription>
                This will remove the blog and its content from your workspace. To confirm, enter the blog name exactly as shown.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-blog-name">
                Enter <span className="font-semibold text-foreground">{blogName}</span>
              </Label>
              <Input
                id="delete-blog-name"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                disabled={pending}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>Cancel</Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={!matches || pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {pending ? "Deleting..." : "Delete blog"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
