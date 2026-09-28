"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function GroupTranslationsToggle({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setGrouped(checked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (checked) {
      params.delete("groupTranslations");
    } else {
      params.set("groupTranslations", "false");
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname);
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-card px-3 py-2">
      <Switch
        id="group-translations"
        checked={enabled}
        onCheckedChange={setGrouped}
        disabled={pending}
      />
      <Label htmlFor="group-translations" className="cursor-pointer whitespace-nowrap text-sm font-normal">
        Group translations
      </Label>
    </div>
  );
}
