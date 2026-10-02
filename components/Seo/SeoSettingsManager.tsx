"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { saveBlogSeoSettings } from "@/src/server/services/seo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StyleReferencesPicker } from "@/components/Growth/StyleReferencesPicker";
import { toast } from "sonner";
import { useUnsavedChanges } from "@/components/UnsavedChanges/UnsavedChangesProvider";
import { getLanguageName } from "@/lib/languages";
import { BrandCardEditor, ThumbnailFormatPicker } from "@/components/Growth/ThumbnailFormatControls";
import { coverTypography, isThumbnailFormat, thumbnailColors, type ThumbnailFormat } from "@/lib/autopilot/thumbnail-templates";
import { LogoPositionPicker, LogoUploader } from "@/components/Growth/LogoControls";
import { ImagePreviewDialog } from "@/components/Growth/ImagePreviewDialog";
import { RefreshCoversDialog } from "@/components/Growth/RefreshCoversDialog";
import { isLogoPosition, type LogoPosition } from "@/lib/autopilot/logo";
import { SEARCH_MARKETS, defaultSearchMarket } from "@/lib/autopilot/search-markets";

type Credential = { id: string; label: string; loginHint: string };
type Settings = {
  credentialId: string | null; enabled: boolean; targetDomain: string | null; locationCode: number; languageCode: string;
  timezone: string; competitorDomains: string[]; audience: string | null; brandVoice: string | null; publishingMode: string;
  thumbnailEnabled: boolean; inlineImagesEnabled: boolean;
  thumbnailFormat: string; thumbnailColors: string[]; thumbnailTypography: unknown;
  logoUrl: string | null; thumbnailLogoPosition: string; inlineLogoPosition: string;
  thumbnailReferenceUrls: string[]; inlineImageReferenceUrls: string[];
  internalLinksEnabled: boolean; backlinksEnabled: boolean;
  thumbnailStyle: string | null; inlineImageStyle: string | null; maxInlineImages: number;
  articleUrlPrefix: string;
  articlePaths: unknown;
  perRunBudgetUsdMicros: number; dailyBudgetUsdMicros: number; monthlyBudgetUsdMicros: number;
} | null;

const usd = (micros: number | undefined, fallback: number) => String((micros ?? fallback * 1_000_000) / 1_000_000);
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 py-6 md:grid-cols-[11rem_1fr] md:gap-8">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, name, hint, ...props }: { label: string; name: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Area({ label, name, ...props }: { label: string; name: string } & React.ComponentProps<typeof Textarea>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} rows={3} {...props} />
    </div>
  );
}

function SettingToggle({ id, label, checked, onChange, disabled }: {
  id: string; label: string; checked: boolean; onChange: (checked: boolean) => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <Label htmlFor={id} className="font-normal">{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function SeoSettingsManager({ blogId, plan, credentials, settings, languages = [], posts = [] }: {
  blogId: string;
  /** Recent articles to try image settings on. */
  posts?: { id: string; title: string }[];
  /** Shown on the brand thumbnail preview. */
  /** The blog's languages; each can have its own article path. */
  languages?: string[];
  plan: "lifetime" | "subscription";
  credentials: Credential[];
  settings: Settings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [thumbnailEnabled, setThumbnailEnabled] = useState(settings?.thumbnailEnabled ?? true);
  const [thumbnailFormat, setThumbnailFormat] = useState<ThumbnailFormat>(isThumbnailFormat(settings?.thumbnailFormat) ? settings.thumbnailFormat : "generated");
  const [coverColors, setCoverColors] = useState(() => thumbnailColors(settings?.thumbnailColors));
  const [typography, setTypography] = useState(() => coverTypography(settings?.thumbnailTypography));
  const [logoUrl, setLogoUrl] = useState(settings?.logoUrl ?? null);
  /**
   * A logo left unplaced is never drawn, so a freshly uploaded one starts in
   * the thumbnail's top-left corner. A position already chosen is kept,
   * including an explicit "No logo". Images inside the article stay unmarked
   * unless asked for: a logo on every illustration is rarely wanted.
   */
  function changeLogo(next: string | null) {
    setLogoUrl(next);
    if (!next || settings?.logoUrl) return;
    setThumbnailLogoPosition((current) => (current === "none" ? "top-left" : current));
  }
  const [thumbnailLogoPosition, setThumbnailLogoPosition] = useState<LogoPosition>(isLogoPosition(settings?.thumbnailLogoPosition) ? settings.thumbnailLogoPosition : "none");
  const [inlineLogoPosition, setInlineLogoPosition] = useState<LogoPosition>(isLogoPosition(settings?.inlineLogoPosition) ? settings.inlineLogoPosition : "none");
  const formRef = useRef<HTMLFormElement>(null);
  /** Current text of a style field (they are uncontrolled), for previews. */
  const fieldValue = (name: string) => (formRef.current?.elements.namedItem(name) as HTMLTextAreaElement | null)?.value.trim() || null;
  const [inlineImagesEnabled, setInlineImagesEnabled] = useState(settings?.inlineImagesEnabled ?? true);
  const [internalLinksEnabled, setInternalLinksEnabled] = useState(settings?.internalLinksEnabled ?? true);
  const [backlinksEnabled, setBacklinksEnabled] = useState(settings?.backlinksEnabled ?? true);
  const [thumbnailReferences, setThumbnailReferences] = useState(settings?.thumbnailReferenceUrls ?? []);
  const [inlineReferences, setInlineReferences] = useState(settings?.inlineImageReferenceUrls ?? []);
  const [credentialId, setCredentialId] = useState(settings?.credentialId || credentials[0]?.id || "");

  const managed = plan === "subscription";
  const savedArticlePaths = settings?.articlePaths && typeof settings.articlePaths === "object" ? settings.articlePaths as Record<string, string> : {};
  const connected = managed || credentials.length > 0;
  const activeCredential = credentials.find((item) => item.id === credentialId);

  const { markSaved } = useUnsavedChanges({
    formRef,
    save: persist,
    value: {
      enabled, credentialId, thumbnailEnabled, thumbnailFormat, coverColors, typography, logoUrl, thumbnailLogoPosition, inlineLogoPosition,
      inlineImagesEnabled, internalLinksEnabled, backlinksEnabled, thumbnailReferences, inlineReferences,
    },
  });

  async function persist() {
    if (!formRef.current) return false;
    const form = new FormData(formRef.current);
    const nullable = (name: string) => String(form.get(name) || "").trim() || null;
    const result = await saveBlogSeoSettings(blogId, {
      credentialId: managed ? null : credentialId || null, enabled, targetDomain: nullable("targetDomain"),
      locationCode: Number(form.get("locationCode")), languageCode: String(form.get("languageCode")), timezone: String(form.get("timezone")),
      competitorDomains: String(form.get("competitors") || "").split(/[\n,]/).map((v) => v.trim()).filter(Boolean),
      audience: nullable("audience"), brandVoice: nullable("brandVoice"), publishingMode: settings?.publishingMode ?? "draft",
      thumbnailEnabled, inlineImagesEnabled, internalLinksEnabled, backlinksEnabled,
      thumbnailFormat, thumbnailColors: [...coverColors], thumbnailTypography: typography,
      logoUrl, thumbnailLogoPosition, inlineLogoPosition,
      thumbnailReferenceUrls: thumbnailReferences, inlineImageReferenceUrls: inlineReferences,
      thumbnailStyle: nullable("thumbnailStyle"), inlineImageStyle: nullable("inlineImageStyle"),
      articleUrlPrefix: String(form.get("articleUrlPrefix") || "/blog"),
      articlePaths: Object.fromEntries(languages.map((code) => [code, String(form.get(`articlePath:${code}`) || "")])),
      maxInlineImages: Number(form.get("maxInlineImages") ?? settings?.maxInlineImages ?? 3),
      perRunBudgetUsd: Number(form.get("perRunBudgetUsd")), dailyBudgetUsd: Number(form.get("dailyBudgetUsd")), monthlyBudgetUsd: Number(form.get("monthlyBudgetUsd")),
    });
    if (result.error) { toast.error(result.error); return false; }
    markSaved();
    toast.success("Autopilot settings saved");
    router.refresh();
    return true;
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => { await persist(); });
  }

  return (
    <form ref={formRef} onSubmit={save} className="space-y-6">
      {/* Edited in the Schedule tab and the blog's languages; kept so saving here never clears them. */}
      <input type="hidden" name="targetDomain" value={settings?.targetDomain || ""} />
      <input type="hidden" name="languageCode" value={settings?.languageCode ?? "en"} />

      <div className="divide-y">
        <Section title="SEO research">
          <div className="flex items-center justify-between gap-6">
            <p className="text-sm text-muted-foreground">
              {managed ? "Included in your plan."
                : connected ? <>Uses {activeCredential?.label ?? "your DataForSEO connection"}.</>
                  : <>Connect DataForSEO in <Link href={`/dashboard/blogs/${blogId}/settings/providers`} className="text-foreground underline underline-offset-4">Providers</Link> to use search data.</>}
            </p>
            <Switch id="seo-enabled" aria-label="SEO research" checked={enabled} onCheckedChange={setEnabled} disabled={pending || !connected} />
          </div>
          {!managed && credentials.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="credential">DataForSEO connection</Label>
              <Select value={credentialId} onValueChange={setCredentialId} disabled={pending}>
                <SelectTrigger id="credential" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{credentials.map((item) => <SelectItem key={item.id} value={item.id}>{item.label} · {item.loginHint}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </Section>

        <Section title="Brand">
          <Area label="Audience" name="audience" defaultValue={settings?.audience || ""} placeholder="Who you write for" />
          <Area label="Voice" name="brandVoice" defaultValue={settings?.brandVoice || ""} placeholder="Tone, words to use or avoid" />
        </Section>

        <Section title="Logo">
          <LogoUploader blogId={blogId} value={logoUrl} onChange={changeLogo} disabled={pending} />
        </Section>

        <Section title="Thumbnail">
          <SettingToggle id="thumbnail-enabled" label="Generate a thumbnail" checked={thumbnailEnabled} onChange={setThumbnailEnabled} disabled={pending} />
          {thumbnailEnabled && <ThumbnailFormatPicker value={thumbnailFormat} onChange={setThumbnailFormat} disabled={pending} />}
          {thumbnailEnabled && thumbnailFormat !== "generated" && (
            <BrandCardEditor
              format={thumbnailFormat} colors={coverColors} onChange={setCoverColors}
              typography={typography} onTypographyChange={setTypography}
              blogId={blogId} logoUrl={logoUrl} logoPosition={thumbnailLogoPosition}
              onLogoPositionChange={setThumbnailLogoPosition} disabled={pending}
            />
          )}
          {/* Kept mounted while hidden so its value is saved unchanged. */}
          <div className={thumbnailEnabled && thumbnailFormat !== "template" ? "grid" : "hidden"}>
            <Area label={thumbnailFormat === "generated" ? "Style" : "Illustration style"} name="thumbnailStyle" defaultValue={settings?.thumbnailStyle || ""} placeholder="Editorial cover art, no text…" />
          </div>
          {thumbnailEnabled && thumbnailFormat !== "template" && <StyleReferencesPicker blogId={blogId} value={thumbnailReferences} onChange={setThumbnailReferences} disabled={pending} />}
          {/* The brand-card editor shows this beside its preview; "generated" has no editor. */}
          {thumbnailEnabled && logoUrl && thumbnailFormat === "generated" && (
            <div className="grid gap-2">
              <Label>Logo position</Label>
              <LogoPositionPicker value={thumbnailLogoPosition} onChange={setThumbnailLogoPosition} disabled={pending} />
            </div>
          )}
          {thumbnailEnabled && (
            <div className="flex flex-wrap items-center gap-2">
              <ImagePreviewDialog
                blogId={blogId}
                kind="cover"
                posts={posts}
                usesAi={thumbnailFormat !== "template"}
                settings={() => ({
                  format: thumbnailFormat, colors: [...coverColors], typography, style: fieldValue("thumbnailStyle"),
                  referenceUrls: thumbnailReferences, logoUrl, logoPosition: logoUrl ? thumbnailLogoPosition : "none",
                })}
              />
              <RefreshCoversDialog blogId={blogId} usesAi={thumbnailFormat !== "template"} disabled={pending} />
            </div>
          )}
        </Section>

        <Section title="Post images">
          <SettingToggle id="inline-images-enabled" label="Add images inside the article" checked={inlineImagesEnabled} onChange={setInlineImagesEnabled} disabled={pending} />
          <div className={inlineImagesEnabled ? "grid gap-4" : "hidden"}>
            <Area label="Style" name="inlineImageStyle" defaultValue={settings?.inlineImageStyle || ""} placeholder="Simple explanatory diagrams…" />
            <Field label="Images per article" name="maxInlineImages" type="number" min="0" max="8" className="sm:max-w-32" defaultValue={String(settings?.maxInlineImages ?? 3)} />
          </div>
          {inlineImagesEnabled && <StyleReferencesPicker blogId={blogId} value={inlineReferences} onChange={setInlineReferences} disabled={pending} />}
          {inlineImagesEnabled && logoUrl && (
            <div className="grid gap-2">
              <Label>Logo position</Label>
              <LogoPositionPicker value={inlineLogoPosition} onChange={setInlineLogoPosition} disabled={pending} />
            </div>
          )}
          {inlineImagesEnabled && (
            <ImagePreviewDialog
              blogId={blogId}
              kind="inline"
              posts={posts}
              usesAi
              settings={() => ({
                style: fieldValue("inlineImageStyle"), referenceUrls: inlineReferences,
                logoUrl, logoPosition: logoUrl ? inlineLogoPosition : "none",
              })}
            />
          )}
        </Section>

        <Section title="Links">
          <SettingToggle id="internal-links-enabled" label="New articles link to your older ones" checked={internalLinksEnabled} onChange={setInternalLinksEnabled} disabled={pending} />
          <p className="-mt-2 text-xs text-muted-foreground">Each new Autopilot article links to 2–4 related articles you already published.</p>
          <SettingToggle id="backlinks-enabled" label="Older articles link to new ones" checked={backlinksEnabled} onChange={setBacklinksEnabled} disabled={pending} />
          <p className="-mt-2 text-xs text-muted-foreground">When a new Autopilot article goes live, up to 3 of your published articles that mention its topic get a link to it. Only a few words are turned into a link; nothing else changes.</p>
        </Section>

        <details className="group py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 py-4 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Advanced
          </summary>
          <div className="grid gap-4 pb-6 md:pl-[13rem]">
            <Area label="Competitors" name="competitors" defaultValue={settings?.competitorDomains.join("\n") || ""} placeholder={"competitor-one.com\ncompetitor-two.com"} />
            <Field label="Article URL path" name="articleUrlPrefix" defaultValue={settings?.articleUrlPrefix ?? "/blog"} placeholder="/blog" hint="Used for internal links, for example /blog/article-slug." />
            {languages.length > 1 && (
              <div className="grid gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Article path per language</p>
                  <p className="text-xs text-muted-foreground">Only if your site serves languages apart, like /es/blog or https://es.example.com/blog. Empty uses the path above.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {languages.map((code) => (
                    <Field
                      key={code}
                      label={getLanguageName(code) ?? code}
                      name={`articlePath:${code}`}
                      defaultValue={savedArticlePaths[code] ?? ""}
                      placeholder={settings?.articleUrlPrefix ?? "/blog"}
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="locationCode">Search market</Label>
                <Select name="locationCode" defaultValue={String(settings?.locationCode ?? defaultSearchMarket(settings?.languageCode ?? "en"))}>
                  <SelectTrigger id="locationCode" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {!SEARCH_MARKETS.some((market) => market.code === settings?.locationCode) && settings?.locationCode
                      ? <SelectItem value={String(settings.locationCode)}>Location {settings.locationCode}</SelectItem> : null}
                    {SEARCH_MARKETS.map((market) => <SelectItem key={market.code} value={String(market.code)}>{market.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Country whose Google searches set keyword volume and difficulty.</p>
              </div>
              <Field label="Timezone" name="timezone" defaultValue={settings?.timezone ?? "Europe/Madrid"} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Per run (USD)" name="perRunBudgetUsd" type="number" step="any" min="0.001" defaultValue={usd(settings?.perRunBudgetUsdMicros, 0.25)} />
              <Field label="Per day (USD)" name="dailyBudgetUsd" type="number" step="any" min="0.001" defaultValue={usd(settings?.dailyBudgetUsdMicros, 1)} />
              <Field label="Per month (USD)" name="monthlyBudgetUsd" type="number" step="any" min="0.001" defaultValue={usd(settings?.monthlyBudgetUsdMicros, 20)} />
            </div>
          </div>
        </details>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-5">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
