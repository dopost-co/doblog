"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS, stepIndex, type OnboardingField, type OnboardingValues } from "@/lib/onboarding/steps";
import { completeOnboardingStep } from "@/src/server/services/onboarding/actions";

function celebrate() {
  const defaults = { spread: 70, ticks: 200, gravity: 0.9, scalar: 0.9, disableForReducedMotion: true };
  confetti({ ...defaults, particleCount: 80, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  confetti({ ...defaults, particleCount: 80, origin: { x: 0.8, y: 0.7 }, angle: 120 });
}

function FieldInput({ field, value, onChange, disabled }: {
  field: OnboardingField;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled: boolean;
}) {
  if (!field.multiple) {
    return (
      <Input
        id={field.name}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        maxLength={field.maxLength}
        disabled={disabled}
        autoFocus
        className="h-11 text-base"
      />
    );
  }
  const values = value as string[];
  return (
    <div className="grid gap-2">
      {values.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input
            id={index === 0 ? field.name : undefined}
            aria-label={`${field.label} ${index + 1}`}
            value={item}
            onChange={(e) => onChange(values.map((current, i) => (i === index ? e.target.value : current)))}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            disabled={disabled}
            autoFocus={index === values.length - 1}
            className="h-11 text-base"
          />
          {values.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Remove" disabled={disabled} onClick={() => onChange(values.filter((_, i) => i !== index))}>
              <X />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="justify-self-start text-muted-foreground" disabled={disabled} onClick={() => onChange([...values, ""])}>
        <Plus /> {field.addLabel ?? "Add another"}
      </Button>
    </div>
  );
}

export function OnboardingFlow({ initialStep, initialValues }: { initialStep: string | null; initialValues: OnboardingValues }) {
  const router = useRouter();
  const [index, setIndex] = useState(stepIndex(initialStep));
  const [values, setValues] = useState<OnboardingValues>(() => Object.fromEntries(
    ONBOARDING_STEPS.flatMap((step) => step.fields.map((field): [string, string | string[]] => {
      const multiple = "multiple" in field && field.multiple;
      return [field.name, initialValues[field.name] ?? (multiple ? [""] : "")];
    })),
  ));
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  const step = ONBOARDING_STEPS[index];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const stepValues = Object.fromEntries(step.fields.map((field) => [field.name, values[field.name]]));
      const result = await completeOnboardingStep(step.id, stepValues);
      if ("error" in result && result.error) { setError(result.error); return; }
      if (result.done) {
        setFinished(true);
        celebrate();
        setTimeout(() => router.replace("/dashboard"), 1600);
        return;
      }
      setIndex((current) => current + 1);
    });
  }

  if (finished) {
    return <p className="text-center text-2xl font-semibold tracking-tight">You’re all set</p>;
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-8">
      <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${ONBOARDING_STEPS.length}`}>
        {ONBOARDING_STEPS.map((item, i) => (
          <span key={item.id} className={cn("h-1 flex-1 rounded-full transition-colors", i <= index ? "bg-foreground" : "bg-border")} />
        ))}
      </div>

      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{step.title}</h1>
        {"description" in step && step.description && <p className="text-sm text-muted-foreground">{step.description}</p>}
      </div>

      <div className="space-y-5">
        {step.fields.map((field) => (
          <div key={field.name} className="grid gap-2">
            <Label htmlFor={field.name} className="sr-only">{field.label}</Label>
            <FieldInput
              field={field}
              value={values[field.name]}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
              disabled={pending}
            />
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex items-center justify-between">
        {index > 0 ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setIndex((current) => current - 1)}>
            <ArrowLeft /> Back
          </Button>
        ) : <span />}
        <Button type="submit" disabled={pending} className="min-w-28">
          {pending ? "Saving…" : index === ONBOARDING_STEPS.length - 1 ? "Finish" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
