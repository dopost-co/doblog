"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { ArrowLeft, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BlogLanguagesPicker } from "@/components/BlogLanguages/BlogLanguagesPicker";
import { StyleReferencesPicker } from "@/components/Growth/StyleReferencesPicker";
import { WritingDaysPicker } from "@/components/Growth/WritingDaysPicker";
import { DEFAULT_WRITING_DAYS } from "@/lib/autopilot/writing-days";
import { MAX_COMPETITORS } from "@/lib/autopilot/competitors";
import type { SiteAnalysis } from "@/lib/onboarding/analysis";
import { SiteImages, WebsiteAnalysis, type AnalysisStatus } from "@/components/Onboarding/WebsiteAnalysis";
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

function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

/** The bare domain typed in a website field, to compare it with an analysis. */
const domainOf = (value: string | string[] | undefined) => String(Array.isArray(value) ? value[0] ?? "" : value ?? "")
  .trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];

/** A suggestion as editable text, with presets to start from instead. */
function SuggestedText({ id, label, value, onChange, source, presets, selectedPreset, onPreset, placeholder, disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The website it was learned from, while the text is still the suggestion. */
  source: string | null;
  presets: readonly { id: string; title: string }[];
  selectedPreset: string | null;
  onPreset: (id: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {source && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground animate-in fade-in">
            <Sparkles className="size-3" /> From {source}
          </span>
        )}
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={2000}
        rows={5}
        disabled={disabled}
        className="text-sm leading-relaxed"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Start from:</span>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selectedPreset === preset.id}
            disabled={disabled}
            onClick={() => onPreset(preset.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors hover:border-primary/60 hover:text-foreground",
              selectedPreset === preset.id ? "border-primary bg-primary/[0.06] text-foreground" : "text-muted-foreground",
            )}
          >
            {preset.title}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Up to MAX_COMPETITORS competitor sites, with the ones the analysis found as suggestions. */
function CompetitorsField({ value, onChange, suggestions, disabled }: {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: Array<{ domain: string; reason: string }>;
  disabled: boolean;
}) {
  const slots = Array.from({ length: MAX_COMPETITORS }, (_, index) => value[index] ?? "");
  const reasonFor = (domain: string) => suggestions.find((item) => item.domain === domainOf(domain))?.reason;
  const unused = suggestions.filter((item) => !slots.some((slot) => domainOf(slot) === item.domain));
  const add = (domain: string) => {
    const empty = slots.findIndex((slot) => !slot.trim());
    onChange(slots.map((slot, index) => (index === (empty === -1 ? slots.length - 1 : empty) ? domain : slot)));
  };
  return (
    <div className="space-y-4">
      {slots.map((slot, index) => (
        <div key={index} className="grid gap-1.5">
          <Label htmlFor={`competitor-${index}`} className="text-xs text-muted-foreground">Competitor {index + 1}</Label>
          <Input
            id={`competitor-${index}`}
            value={slot}
            onChange={(event) => onChange(slots.map((current, i) => (i === index ? event.target.value : current)))}
            placeholder="rival.com"
            maxLength={2048}
            disabled={disabled}
            autoComplete="off"
            className="h-11 text-base"
          />
          {/* Reserved height keeps the inputs still while typing. */}
          <p className="min-h-4 text-xs text-muted-foreground">{reasonFor(slot) ?? ""}</p>
        </div>
      ))}
      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Also found:</span>
          {unused.map((item) => (
            <button
              key={item.domain}
              type="button"
              title={item.reason}
              disabled={disabled}
              onClick={() => add(item.domain)}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Plus className="size-3" /> {item.domain}
            </button>
          ))}
        </div>
      )}
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
      if (field.name === "timezone") return [field.name, browserTimeZone()];
      // Reference lists start empty; other multi-value fields start with one input.
      if (field.name.endsWith("References") || field.name === "competitors") return [field.name, initialValues[field.name] ?? []];
      return [field.name, initialValues[field.name] ?? (multiple ? [""] : fallback)];
    })),
  ));
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  // What the website analysis found this session; later steps show it as suggestions.
  const [analysis, setAnalysis] = useState<SiteAnalysis | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [pending, startTransition] = useTransition();
  // Which steps apply depends on the answers (e.g. writing by hand skips Autopilot).
  const steps = visibleSteps(flow, values);
  const [stepId, setStepId] = useState(() => resolveVisibleStep(flow, initialStep, values)?.id ?? steps[0]?.id);
  const index = Math.max(0, steps.findIndex((item) => item.id === stepId));
  const step = steps[index];

  const analysisDomain = analysis ? domainOf(analysis.domain) : null;
  const currentAnalysis = analysis && analysisDomain === domainOf(values.website) ? analysis : null;
  const analyzing = (step.id === "website-analysis" || step.id === "autopilot-website-analysis") && analysisStatus === "running" && !currentAnalysis;

  /** Fills the next steps with what the website analysis found, keeping answers the user already chose. */
  function applyAnalysis(result: SiteAnalysis, setLanguage: boolean) {
    setAnalysis(result);
    setValues((current) => {
      const next = { ...current };
      const chosen = current.languages as string[];
      // Only before the languages question; afterwards the saved languages stay as they are.
      if (setLanguage && result.language && !initialValues.languages && chosen.length === 1 && chosen[0] === "en") next.languages = [result.language];
      if (result.audience) Object.assign(next, { audienceChoice: "other", audienceCustom: result.audience });
      if (result.brandVoice) Object.assign(next, { voiceChoice: "other", brandVoiceCustom: result.brandVoice });
      if (result.competitors.length) next.competitors = result.competitors.slice(0, MAX_COMPETITORS).map((item) => item.domain);
      if (result.thumbnailStyle) Object.assign(next, { thumbnailStyleChoice: "other", thumbnailStyleCustom: result.thumbnailStyle });
      if (result.inlineImageStyle) Object.assign(next, { inlineStyleChoice: "other", inlineStyleCustom: result.inlineImageStyle });
      return next;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // An empty website is the same as saying there is none yet.
    save(step.id === "blog-website" && !String(values.website).trim() ? { website: "", websiteSkipped: "true" } : {});
  }

  /** Saves the step; `override` replaces answers first (e.g. skipping the website). */
  function save(override: OnboardingValues = {}) {
    setError("");
    if (Object.keys(override).length) setValues((current) => ({ ...current, ...override }));
    startTransition(async () => {
      const stepValues = { ...Object.fromEntries(step.fields.map((field) => [field.name, values[field.name]])), ...override };
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
        <h1 className="text-2xl font-semibold tracking-tight">
          {step.id === "website-analysis" || step.id === "autopilot-website-analysis" ? `Getting to know ${domainOf(values.website)}` : step.title}
        </h1>
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
        ) : step.id === "blog-website" ? (
          <div className="space-y-3">
            <Label htmlFor="website" className="sr-only">Website address</Label>
            <Input
              id="website"
              value={values.website as string}
              onChange={(event) => setValues((current) => ({ ...current, website: event.target.value, websiteSkipped: "false" }))}
              placeholder="yourwebsite.com"
              maxLength={2048}
              inputMode="url"
              autoComplete="url"
              disabled={pending}
              autoFocus
              className="h-11 text-base"
            />
            <Button type="button" variant="link" className="h-auto px-0 text-muted-foreground" disabled={pending} onClick={() => save({ website: "", websiteSkipped: "true" })}>
              I don’t have a website yet
            </Button>
          </div>
        ) : step.id === "website-analysis" || step.id === "autopilot-website-analysis" ? (
          blogId ? (
            <WebsiteAnalysis
              key={domainOf(values.website)}
              blogId={blogId}
              website={values.website as string}
              result={currentAnalysis}
              onResult={(result) => applyAnalysis(result, step.id === "website-analysis")}
              onStatus={setAnalysisStatus}
            />
          ) : null
        ) : step.id === "autopilot-competitors" ? (
          <CompetitorsField
            value={values.competitors as string[]}
            onChange={(competitors) => setValues((current) => ({ ...current, competitors }))}
            suggestions={currentAnalysis?.competitors ?? []}
            disabled={pending}
          />
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
          const learned = prefix === "thumbnail" ? currentAnalysis?.thumbnailStyle : currentAnalysis?.inlineImageStyle;
          const options = learned
            ? [{ id: "other", title: "Match my website", example: `Learned from ${domainOf(currentAnalysis!.domain)}` }, ...presets]
            : [...presets, { id: "other", title: "Other", example: "Describe the style you want." }];
          return (
            <div className="space-y-6">
              <ChoiceCards
                options={options}
                value={values[choiceField] as string}
                onChange={(choice) => setValues((current) => ({ ...current, [choiceField]: choice }))}
                disabled={pending}
              />
              {values[choiceField] === "other" && <div className="grid gap-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={customField}>{learned ? "Style from your website" : "Describe the style"}</Label>
                  {learned && (
                    <span className="flex items-center gap-2">
                      {currentAnalysis!.colors.map((color) => <span key={color} title={color} className="size-4 rounded-full border" style={{ backgroundColor: color }} />)}
                      {currentAnalysis!.images.length > 0 && <SiteImages images={currentAnalysis!.images.slice(0, 3)} />}
                    </span>
                  )}
                </div>
                <Textarea
                  id={customField}
                  value={values[customField] as string}
                  onChange={(event) => setValues((current) => ({ ...current, [customField]: event.target.value }))}
                  placeholder="For example: muted pastel illustrations with soft grain, lots of white space…"
                  maxLength={1000}
                  rows={learned ? 5 : 3}
                  disabled={pending}
                  autoFocus={!learned}
                  className="text-sm leading-relaxed"
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
        })() : step.id === "autopilot-audience" ? (() => {
          const preset = AUTOPILOT_AUDIENCE_OPTIONS.find((option) => option.id === values.audienceChoice);
          const text = values.audienceChoice === "other" ? values.audienceCustom as string : preset?.value ?? "";
          return (
            <SuggestedText
              id="audienceCustom"
              label="Your readers"
              value={text}
              onChange={(audienceCustom) => setValues((current) => ({ ...current, audienceChoice: "other", audienceCustom }))}
              source={currentAnalysis?.audience && text === currentAnalysis.audience ? domainOf(currentAnalysis.domain) : null}
              presets={AUTOPILOT_AUDIENCE_OPTIONS}
              selectedPreset={preset?.id ?? null}
              onPreset={(audienceChoice) => setValues((current) => ({ ...current, audienceChoice, audienceCustom: "" }))}
              placeholder="Who they are, what they want to achieve and what worries them. For example: owners of small online shops who run their own social media and want more sales without paying for ads."
              disabled={pending}
            />
          );
        })() : step.id === "autopilot-voice" ? (() => {
          const preset = AUTOPILOT_VOICE_OPTIONS.find((option) => option.id === values.voiceChoice);
          const learning = values.voiceChoice === "competitor";
          const text = values.voiceChoice === "other" ? values.brandVoiceCustom as string : preset?.value ?? "";
          return (
            <div className="space-y-4">
              {learning ? (
                <div className="grid gap-2 animate-in fade-in">
                  <Label htmlFor="competitorUrl">Competitor whose tone you like</Label>
                  <Input
                    id="competitorUrl"
                    value={values.competitorUrl as string}
                    onChange={(event) => setValues((current) => ({ ...current, competitorUrl: event.target.value }))}
                    placeholder="rival.com"
                    maxLength={2048}
                    disabled={pending}
                    autoFocus
                    className="h-11 text-base"
                  />
                  <p className="text-xs text-muted-foreground">Zenex reads their homepage and writes original guidelines from it. It never copies their wording.</p>
                </div>
              ) : (
                <SuggestedText
                  id="brandVoiceCustom"
                  label="How your articles sound"
                  value={text}
                  onChange={(brandVoiceCustom) => setValues((current) => ({ ...current, voiceChoice: "other", brandVoiceCustom }))}
                  source={currentAnalysis?.brandVoice && text === currentAnalysis.brandVoice ? domainOf(currentAnalysis.domain) : null}
                  presets={AUTOPILOT_VOICE_OPTIONS}
                  selectedPreset={preset?.id ?? null}
                  onPreset={(voiceChoice) => setValues((current) => ({ ...current, voiceChoice, brandVoiceCustom: "" }))}
                  placeholder="Tone, sentence style, words to use or avoid. For example: close and practical, short sentences, real examples, no jargon."
                  disabled={pending}
                />
              )}
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 text-muted-foreground"
                disabled={pending}
                onClick={() => setValues((current) => learning
                  ? { ...current, voiceChoice: current.brandVoiceCustom ? "other" : "clear-expert" }
                  : { ...current, voiceChoice: "competitor", competitorUrl: (current.competitorUrl as string) || (current.competitors as string[])[0] || "" })}
              >
                {learning ? "Write the voice instead" : "Sound like a competitor instead"}
              </Button>
            </div>
          );
        })() : step.id === "autopilot-frequency" ? (
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
        ) : step.fields.filter((field) => !("hidden" in field && field.hidden)).map((field) => (
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
        <Button type="submit" disabled={pending || analyzing} className="min-w-28">
          {pending ? "Saving…" : analyzing ? "Analyzing…" : index === steps.length - 1 ? "Finish" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
