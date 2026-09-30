"use client";

import { useState, useTransition } from "react";
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

type Credential = { id: string; label: string; loginHint: string };
type Settings = {
  credentialId: string | null; enabled: boolean; targetDomain: string | null; locationCode: number; languageCode: string;
  timezone: string; competitorDomains: string[]; audience: string | null; brandVoice: string | null; publishingMode: string;
  thumbnailStyle: string | null; inlineImageStyle: string | null; maxInlineImages: number;
  articleUrlPrefix: string;
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

export function SeoSettingsManager({ blogId, plan, credentials, settings }: {
  blogId: string;
  plan: "lifetime" | "subscription";
  credentials: Credential[];
  settings: Settings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [credentialId, setCredentialId] = useState(settings?.credentialId || credentials[0]?.id || "");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const managed = plan === "subscription";
  const connected = managed || credentials.length > 0;
  const activeCredential = credentials.find((item) => item.id === credentialId);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const nullable = (name: string) => String(form.get(name) || "").trim() || null;
    startTransition(async () => {
      const result = await saveBlogSeoSettings(blogId, {
        credentialId: managed ? null : credentialId || null, enabled, targetDomain: nullable("targetDomain"),
        locationCode: Number(form.get("locationCode")), languageCode: String(form.get("languageCode")), timezone: String(form.get("timezone")),
        competitorDomains: String(form.get("competitors") || "").split(/[\n,]/).map((v) => v.trim()).filter(Boolean),
        audience: nullable("audience"), brandVoice: nullable("brandVoice"), publishingMode: settings?.publishingMode ?? "draft",
        thumbnailStyle: nullable("thumbnailStyle"), inlineImageStyle: nullable("inlineImageStyle"),
        articleUrlPrefix: String(form.get("articleUrlPrefix") || "/blog"),
        maxInlineImages: Number(form.get("maxInlineImages")),
        perRunBudgetUsd: Number(form.get("perRunBudgetUsd")), dailyBudgetUsd: Number(form.get("dailyBudgetUsd")), monthlyBudgetUsd: Number(form.get("monthlyBudgetUsd")),
      });
      setMessage(result.error ? { tone: "error", text: result.error } : { tone: "success", text: "Saved" });
      if (!result.error) router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="space-y-6">
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

        <Section title="Images">
          <div className="grid gap-4 sm:grid-cols-2">
            <Area label="Thumbnail style" name="thumbnailStyle" defaultValue={settings?.thumbnailStyle || ""} placeholder="Editorial cover art, no text…" />
            <Area label="Inline image style" name="inlineImageStyle" defaultValue={settings?.inlineImageStyle || ""} placeholder="Simple explanatory diagrams…" />
          </div>
          <Field label="Images per article" name="maxInlineImages" type="number" min="0" max="8" className="sm:max-w-32" defaultValue={String(settings?.maxInlineImages ?? 3)} />
        </Section>

        <details className="group py-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 py-4 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Advanced
          </summary>
          <div className="grid gap-4 pb-6 md:pl-[13rem]">
            <Area label="Competitors" name="competitors" defaultValue={settings?.competitorDomains.join("\n") || ""} placeholder={"competitor-one.com\ncompetitor-two.com"} />
            <Field label="Article URL path" name="articleUrlPrefix" defaultValue={settings?.articleUrlPrefix ?? "/blog"} placeholder="/blog" hint="Used for internal links, for example /blog/article-slug." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location code" name="locationCode" type="number" defaultValue={String(settings?.locationCode ?? 2840)} hint="DataForSEO location, e.g. 2724 for Spain." />
              <Field label="Timezone" name="timezone" defaultValue={settings?.timezone ?? "Europe/Madrid"} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Per run (USD)" name="perRunBudgetUsd" type="number" step="0.001" min="0.001" defaultValue={usd(settings?.perRunBudgetUsdMicros, 0.25)} />
              <Field label="Per day (USD)" name="dailyBudgetUsd" type="number" step="0.01" min="0.001" defaultValue={usd(settings?.dailyBudgetUsdMicros, 1)} />
              <Field label="Per month (USD)" name="monthlyBudgetUsd" type="number" step="0.01" min="0.001" defaultValue={usd(settings?.monthlyBudgetUsdMicros, 20)} />
            </div>
          </div>
        </details>
      </div>

      <div className="flex items-center justify-end gap-3 border-t pt-5">
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
