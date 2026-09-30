"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BlogLanguagesPicker } from "@/components/BlogLanguages/BlogLanguagesPicker";
import { StyleReferencesPicker } from "@/components/Growth/StyleReferencesPicker";
import { WritingDaysPicker } from "@/components/Growth/WritingDaysPicker";
import { DEFAULT_WRITING_DAYS } from "@/lib/autopilot/writing-days";
import { cn } from "@/lib/utils";
import {
  CONTENT_MODE_OPTIONS,
  INLINE_IMAGE_STYLE_OPTIONS,
  THUMBNAIL_STYLE_OPTIONS,
  AUTOPILOT_AUDIENCE_OPTIONS,
  AUTOPILOT_PUBLISHING_OPTIONS,
  AUTOPILOT_VOICE_OPTIONS,
} from "@/lib/autopilot/options";
import { ONBOARDING_STEPS, resolveVisibleStep, visibleSteps, type OnboardingField, type OnboardingFlowId, type OnboardingValues } from "@/lib/onboarding/steps";
import { completeOnboardingStep } from "@/src/server/services/onboarding/actions";

/** Starting answer for choice fields, so every card question has a selection. */
const FIELD_DEFAULTS: Record<string, string> = {
  publishingMode: "auto_publish",
  audienceChoice: "founders",
  voiceChoice: "clear-expert",
  contentMode: "both",
  thumbnailEnabled: "true",
  thumbnailStyleChoice: "editorial-illustration",
  inlineImagesEnabled: "true",
  inlineStyleChoice: "diagram",
};

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

const THUMBNAIL_CHOICES = [
  { id: "true", title: "Yes, create thumbnails", example: "A cover image for every article." },
  { id: "false", title: "No thumbnails", example: "You’ll add covers yourself." },
];
const INLINE_IMAGE_CHOICES = [
  { id: "true", title: "Yes, add images", example: "Up to two, where they help." },
  { id: "false", title: "No images", example: "Articles are text only." },
];

/** One answer out of a few, shown as selectable cards. */
function ChoiceCards({ options, value, onChange, disabled }: {
  options: readonly { id: string; title: string; example: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value === option.id;
        return <button
          key={option.id}
          type="button"
          aria-pressed={selected}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.03]",
            selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
          )}
        >
          <span className="block text-sm font-medium">{option.title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{option.example}</span>
        </button>;
      })}
    </div>
  );
}

export function OnboardingFlow({ flow, initialStep, initialValues, initialBlogId = null }: {
  flow: OnboardingFlowId;
  initialStep: string | null;
  initialValues: OnboardingValues;
  /** The blog being set up, when the blog step already ran. */
  initialBlogId?: string | null;
}) {
  const router = useRouter();
  const [blogId, setBlogId] = useState(initialBlogId);
  const [values, setValues] = useState<OnboardingValues>(() => Object.fromEntries(
    ONBOARDING_STEPS.flatMap((step) => step.fields.map((field): [string, string | string[]] => {
      const multiple = "multiple" in field && field.multiple;
      const fallback = FIELD_DEFAULTS[field.name] ?? "";
      if (field.name === "languages") return [field.name, initialValues.languages ?? ["en"]];
      if (field.name === "writingDays") return [field.name, initialValues.writingDays ?? DEFAULT_WRITING_DAYS.map(String)];
      // Reference lists start empty; other multi-value fields start with one input.
      if (field.name.endsWith("References")) return [field.name, initialValues[field.name] ?? []];
      return [field.name, initialValues[field.name] ?? (multiple ? [""] : fallback)];
    })),
  ));
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  // Which steps apply depends on the answers (e.g. writing by hand skips Autopilot).
  const steps = visibleSteps(flow, values);
  const [stepId, setStepId] = useState(() => resolveVisibleStep(flow, initialStep, values)?.id ?? steps[0]?.id);
  const index = Math.max(0, steps.findIndex((item) => item.id === stepId));
  const step = steps[index];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const stepValues = Object.fromEntries(step.fields.map((field) => [field.name, values[field.name]]));
      const result = await completeOnboardingStep(flow, step.id, stepValues, blogId);
      if ("error" in result && result.error) { setError(result.error); return; }
      if (result.blogId && result.blogId !== blogId) {
        setBlogId(result.blogId);
        // A reload resumes setting up this blog instead of creating another one.
        if (flow === "new-blog") window.history.replaceState(null, "", `?blog=${result.blogId}`);
      }
      if (result.done) {
        setFinished(true);
        celebrate();
        const destination = flow === "autopilot-setup" ? `/dashboard/blogs/${result.blogId}/autopilot`
          : flow === "new-blog" && result.blogId ? `/dashboard/blogs/${result.blogId}`
            : "/dashboard";
        setTimeout(() => router.replace(destination), 1600);
        return;
      }
      if (result.nextStep) setStepId(result.nextStep);
    });
  }

  if (finished) {
    return <p className="text-center text-2xl font-semibold tracking-tight">You’re all set</p>;
  }

  return (
    <form onSubmit={submit} className="w-full max-w-xl space-y-8">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{step.title}</h1>
        {"description" in step && step.description && !(flow === "new-blog" && step.id === "blogs") && <p className="text-sm text-muted-foreground">{step.description}</p>}
      </div>

      <div className="space-y-5">
        {step.id === "blog-languages" ? (
          <div className="space-y-5">
            <BlogLanguagesPicker
              value={values.languages as string[]}
              onChange={(languages) => setValues((current) => ({ ...current, languages }))}
              disabled={pending}
            />
            {(values.languages as string[]).length > 1 && <label className="flex items-start justify-between gap-4 animate-in fade-in slide-in-from-top-2">
              <span className="grid gap-1">
                <span className="text-sm font-medium">Translate automatically</span>
                <span className="text-xs text-muted-foreground">New and updated posts are translated into the other languages.</span>
              </span>
              <Switch
                checked={values.autoSyncTranslations !== "false"}
                onCheckedChange={(checked) => setValues((current) => ({ ...current, autoSyncTranslations: String(checked) }))}
                disabled={pending}
              />
            </label>}
          </div>
        ) : step.id === "content-mode" ? (
          <ChoiceCards options={CONTENT_MODE_OPTIONS} value={values.contentMode as string} onChange={(contentMode) => setValues((current) => ({ ...current, contentMode }))} disabled={pending} />
        ) : step.id === "autopilot-thumbnails" ? (
          <ChoiceCards options={THUMBNAIL_CHOICES} value={values.thumbnailEnabled as string} onChange={(thumbnailEnabled) => setValues((current) => ({ ...current, thumbnailEnabled }))} disabled={pending} />
        ) : step.id === "autopilot-inline-images" ? (
          <ChoiceCards options={INLINE_IMAGE_CHOICES} value={values.inlineImagesEnabled as string} onChange={(inlineImagesEnabled) => setValues((current) => ({ ...current, inlineImagesEnabled }))} disabled={pending} />
        ) : step.id === "autopilot-thumbnail-style" || step.id === "autopilot-inline-style" ? (() => {
          const prefix = step.id === "autopilot-thumbnail-style" ? "thumbnail" : "inline";
          const choiceField = `${prefix}StyleChoice`;
          const customField = `${prefix}StyleCustom`;
          const referencesField = `${prefix}References`;
          const presets = prefix === "thumbnail" ? THUMBNAIL_STYLE_OPTIONS : INLINE_IMAGE_STYLE_OPTIONS;
          return (
            <div className="space-y-6">
              <ChoiceCards
                options={[...presets, { id: "other", title: "Other", example: "Describe the style you want." }]}
                value={values[choiceField] as string}
                onChange={(choice) => setValues((current) => ({ ...current, [choiceField]: choice }))}
                disabled={pending}
              />
              {values[choiceField] === "other" && <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                <Label htmlFor={customField}>Describe the style</Label>
                <Textarea
                  id={customField}
                  value={values[customField] as string}
                  onChange={(event) => setValues((current) => ({ ...current, [customField]: event.target.value }))}
                  placeholder="For example: muted pastel illustrations with soft grain, lots of white space…"
                  maxLength={1000}
                  disabled={pending}
                  autoFocus
                />
              </div>}
              <StyleReferencesPicker
                blogId={blogId}
                value={values[referencesField] as string[]}
                onChange={(references) => setValues((current) => ({ ...current, [referencesField]: references }))}
                disabled={pending}
              />
            </div>
          );
        })() : step.id === "autopilot-audience" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[...AUTOPILOT_AUDIENCE_OPTIONS, { id: "other", title: "Other", example: "Describe your exact audience." }].map((option) => {
                const selected = values.audienceChoice === option.id;
                return <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={pending}
                  onClick={() => setValues((current) => ({ ...current, audienceChoice: option.id }))}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.03]",
                    selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
                  )}
                >
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.example}</span>
                </button>;
              })}
            </div>
            {values.audienceChoice === "other" && <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
              <Label htmlFor="audienceCustom">Describe your audience</Label>
              <Textarea
                id="audienceCustom"
                value={values.audienceCustom as string}
                onChange={(event) => setValues((current) => ({ ...current, audienceCustom: event.target.value }))}
                placeholder="For example: independent designers who want to run a more profitable studio…"
                maxLength={2000}
                disabled={pending}
                autoFocus
              />
            </div>}
          </div>
        ) : step.id === "autopilot-voice" ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ...AUTOPILOT_VOICE_OPTIONS,
                { id: "competitor", title: "Like a competitor", example: "Learn the style without copying their words." },
                { id: "other", title: "Other", example: "Write your own voice guidelines." },
              ].map((option) => {
                const selected = values.voiceChoice === option.id;
                return <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={pending}
                  onClick={() => setValues((current) => ({ ...current, voiceChoice: option.id }))}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.03]",
                    selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
                  )}
                >
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{option.example}</span>
                </button>;
              })}
            </div>
            {values.voiceChoice === "other" && <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
              <Label htmlFor="brandVoiceCustom">Describe your brand voice</Label>
              <Textarea
                id="brandVoiceCustom"
                value={values.brandVoiceCustom as string}
                onChange={(event) => setValues((current) => ({ ...current, brandVoiceCustom: event.target.value }))}
                placeholder="For example: direct and warm, short sentences, no buzzwords…"
                maxLength={2000}
                disabled={pending}
                autoFocus
              />
            </div>}
            {values.voiceChoice === "competitor" && <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
              <Label htmlFor="competitorUrl">Competitor website</Label>
              <Input
                id="competitorUrl"
                value={values.competitorUrl as string}
                onChange={(event) => setValues((current) => ({ ...current, competitorUrl: event.target.value }))}
                placeholder="https://competitor.com"
                maxLength={2048}
                disabled={pending}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Zenex reads the public homepage and creates original voice guidelines. It never copies their wording.</p>
            </div>}
          </div>
        ) : step.id === "autopilot-frequency" ? (
          <WritingDaysPicker
            value={(values.writingDays as string[]).map(Number)}
            onChange={(days) => setValues((current) => ({ ...current, writingDays: days.map(String) }))}
            disabled={pending}
          />
        ) : step.id === "autopilot-publishing" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {AUTOPILOT_PUBLISHING_OPTIONS.map((option) => {
              const selected = values.publishingMode === option.value;
              return <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => setValues((current) => ({ ...current, publishingMode: option.value }))}
                className={cn(
                  "rounded-xl border bg-card p-5 text-left transition-all hover:border-primary/60 hover:bg-primary/[0.03]",
                  selected && "border-primary bg-primary/[0.05] ring-1 ring-primary",
                )}
              >
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{option.help}</span>
              </button>;
            })}
          </div>
        ) : step.fields.map((field) => (
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
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setStepId(steps[index - 1].id)}>
            <ArrowLeft /> Back
          </Button>
        ) : flow === "new-blog" ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => (window.history.length > 1 ? router.back() : router.push("/dashboard"))}>
            <ArrowLeft /> Cancel
          </Button>
        ) : flow === "autopilot-setup" ? (
          // Going back would reopen this setup, since Autopilot sends unfinished blogs here.
          <Button type="button" variant="ghost" disabled={pending} onClick={() => router.push(`/dashboard/blogs/${blogId}`)}>
            <ArrowLeft /> Cancel
          </Button>
        ) : <span />}
        <Button type="submit" disabled={pending} className="min-w-28">
          {pending ? "Saving…" : index === steps.length - 1 ? "Finish" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
