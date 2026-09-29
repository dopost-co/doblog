"use client";

import { FilePlus2, FileText, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function AddSlotMenu({
  onNewPost,
  onScheduleDraft,
  hasDrafts,
  className,
}: {
  onNewPost: () => void;
  onScheduleDraft: () => void;
  hasDrafts: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Add post"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "flex size-6 items-center justify-center rounded-md border bg-card text-muted-foreground shadow-xs transition-opacity hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100",
          className,
        )}
      >
        <Plus className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onNewPost}>
          <FilePlus2 /> New scheduled post
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onScheduleDraft} disabled={!hasDrafts}>
          <FileText /> Schedule a draft
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
