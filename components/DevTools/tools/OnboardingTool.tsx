"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import { getOnboardingState, setOnboardingState } from "@/src/server/services/dev-tools/actions";

type State = { onboardingCompleted: boolean; onboardingStep: string | null } | null;

export function OnboardingTool() {
  const router = useRouter();
  const [state, setState] = useState<State | undefined>(undefined);
  const [step, setStep] = useState<string>(ONBOARDING_STEPS[0].id);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getOnboardingState().then((value) => {
      setState(value);
      if (value?.onboardingStep) setStep(value.onboardingStep);
    });
  }, []);

  if (state === undefined) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (state === null) return <p className="text-xs text-muted-foreground">Sign in to use this tool.</p>;

  function apply(completed: boolean) {
    startTransition(async () => {
      const result = await setOnboardingState({ completed, step });
      setState({ onboardingCompleted: result.completed, onboardingStep: result.step });
      router.push(completed ? "/dashboard" : "/onboarding");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        {state.onboardingCompleted ? "Completed" : `In progress · ${state.onboardingStep ?? ONBOARDING_STEPS[0].id}`}
      </p>
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">Step</span>
        <select
          value={step}
          onChange={(event) => setStep(event.target.value)}
          disabled={pending}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {ONBOARDING_STEPS.map((item, index) => (
            <option key={item.id} value={item.id}>{index + 1}. {item.id}</option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={pending} onClick={() => apply(false)}>Force onboarding</Button>
        <Button size="sm" variant="outline" className="flex-1" disabled={pending} onClick={() => apply(true)}>Mark completed</Button>
      </div>
    </div>
  );
}
