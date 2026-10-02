"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setUserPlan } from "@/src/server/services/admin/actions";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "lifetime", label: "Lifetime" },
  { value: "subscription", label: "Subscription" },
] as const;

type Plan = typeof OPTIONS[number]["value"];

/** Administrators only: moves an account between plans. Nothing is charged. */
export function PlanSwitcher({ userId, plan, label }: { userId: string; plan: Plan; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Plan) {
    if (next === plan) return;
    startTransition(async () => {
      const result = await setUserPlan({ userId, plan: next });
      if (result.error) { toast.error(result.error); return; }
      toast.success(next === "subscription" ? "Moved to Subscription: platform keys pay from now on" : "Moved to Lifetime: their own keys pay from now on");
      router.refresh();
    });
  }

  return (
    // preventDefault keeps a click from also opening or closing a surrounding <details> row.
    <div role="radiogroup" aria-label={label ?? "Plan"} onClick={(event) => event.preventDefault()} className="inline-flex rounded-md border bg-muted/40 p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={plan === option.value}
          disabled={pending}
          onClick={() => choose(option.value)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
            plan === option.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
