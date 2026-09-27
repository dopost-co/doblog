"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, KeyRound, ShieldCheck } from "lucide-react";
import { createDataForSeoCredential, saveBlogSeoSettings } from "@/src/server/services/seo/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Credential = { id: string; label: string; loginHint: string; verifiedAt: string | null };
type Settings = {
  credentialId: string | null; enabled: boolean; targetDomain: string | null; locationCode: number; languageCode: string;
  timezone: string; competitorDomains: string[]; audience: string | null; brandVoice: string | null; publishingMode: string;
  thumbnailStyle: string | null; inlineImageStyle: string | null; maxInlineImages: number;
  perRunBudgetUsdMicros: number; dailyBudgetUsdMicros: number; monthlyBudgetUsdMicros: number;
} | null;

const usd = (micros: number | undefined, fallback: number) => String((micros ?? fallback * 1_000_000) / 1_000_000);

export function SeoSettingsManager({ blogId, initialCredentials, settings }: { blogId: string; initialCredentials: Credential[]; settings: Settings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [credentials, setCredentials] = useState(initialCredentials);
  const [credentialId, setCredentialId] = useState(settings?.credentialId || initialCredentials[0]?.id || "");
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function addConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createDataForSeoCredential(blogId, { label: form.get("label"), login: form.get("login"), password: form.get("password") });
      if (result.error || !result.credential) { setError(result.error || "Unable to add connection"); return; }
      setCredentials(current => [result.credential!, ...current]); setCredentialId(result.credential.id);
      setSuccess("Connection verified and encrypted. Select Save settings to attach it to this blog."); router.refresh();
    });
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    const nullable = (name: string) => String(form.get(name) || "").trim() || null;
    startTransition(async () => {
      const result = await saveBlogSeoSettings(blogId, {
        credentialId: credentialId || null, enabled, targetDomain: nullable("targetDomain"),
        locationCode: Number(form.get("locationCode")), languageCode: String(form.get("languageCode")), timezone: String(form.get("timezone")),
        competitorDomains: String(form.get("competitors") || "").split(/[\n,]/).map(v => v.trim()).filter(Boolean),
        audience: nullable("audience"), brandVoice: nullable("brandVoice"), publishingMode: String(form.get("publishingMode")),
        thumbnailStyle: nullable("thumbnailStyle"), inlineImageStyle: nullable("inlineImageStyle"),
        maxInlineImages: Number(form.get("maxInlineImages")),
        perRunBudgetUsd: Number(form.get("perRunBudgetUsd")), dailyBudgetUsd: Number(form.get("dailyBudgetUsd")), monthlyBudgetUsd: Number(form.get("monthlyBudgetUsd")),
      });
      if (result.error) { setError(result.error); return; }
      setSuccess("SEO settings saved."); router.refresh();
    });
  }

  return <div className="space-y-8">
    {error && <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="rounded-lg border border-emerald-600/30 p-4 text-sm text-emerald-700 dark:text-emerald-400">{success}</p>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />DataForSEO connection</CardTitle><CardDescription>Connections belong to your account and can be reused by your own blogs. API secrets are encrypted and never exposed to MCP clients or invited members.</CardDescription></CardHeader>
      <CardContent className="space-y-6">
        {credentials.length > 0 && <div className="space-y-2"><Label htmlFor="credential">Connection for this blog</Label><select id="credential" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={credentialId} onChange={e => setCredentialId(e.target.value)} disabled={pending}>
          <option value="">No connection</option>{credentials.map(item => <option key={item.id} value={item.id}>{item.label} · {item.loginHint}{item.verifiedAt ? " · verified" : ""}</option>)}
        </select></div>}
        <form onSubmit={addConnection} className="grid gap-4 rounded-xl border p-4 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="connection-label">New connection label</Label><Input id="connection-label" name="label" placeholder="DataForSEO DoPost" required maxLength={80} disabled={pending} /></div>
          <div className="space-y-2"><Label htmlFor="api-login">API login</Label><Input id="api-login" name="login" type="text" autoComplete="off" required disabled={pending} /></div>
          <div className="space-y-2"><Label htmlFor="api-password">API password</Label><Input id="api-password" name="password" type="password" autoComplete="new-password" required disabled={pending} /></div>
          <div className="md:col-span-3"><Button type="submit" variant="outline" disabled={pending}><ShieldCheck className="mr-2 h-4 w-4" />{pending ? "Verifying…" : "Verify and save connection"}</Button></div>
        </form>
      </CardContent></Card>
    <form onSubmit={save}><Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Blog SEO strategy</CardTitle><CardDescription>MCP research is disabled until you explicitly enable it. Article creation remains draft-first.</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="flex items-center justify-between gap-6 rounded-lg border p-4"><div><Label htmlFor="seo-enabled">Enable SEO tools for this blog</Label><p className="mt-1 text-xs text-muted-foreground">Allows authorized MCP clients to spend within the limits below.</p></div><Switch id="seo-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={pending} /></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Target domain" name="targetDomain" defaultValue={settings?.targetDomain || ""} placeholder="dopost.co" />
        <Field label="Location code" name="locationCode" type="number" defaultValue={String(settings?.locationCode ?? 2840)} />
        <Field label="Language code" name="languageCode" defaultValue={settings?.languageCode ?? "en"} />
        <Field label="Timezone" name="timezone" defaultValue={settings?.timezone ?? "Europe/Madrid"} />
        <div className="space-y-2"><Label htmlFor="publishingMode">Publishing mode</Label><select id="publishingMode" name="publishingMode" defaultValue={settings?.publishingMode ?? "draft"} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="draft">Draft only</option><option value="review">Review queue</option><option value="auto_publish">Auto publish (reserved)</option></select></div>
        <div className="space-y-2">
          <Field label="Maximum inline images" name="maxInlineImages" type="number" min="0" max="8" defaultValue={String(settings?.maxInlineImages ?? 3)} />
          <p className="text-xs leading-relaxed text-muted-foreground">The MCP may use fewer when extra images do not improve the explanation. The thumbnail is separate and does not count toward this maximum.</p>
        </div>
      </div>
      <div className="space-y-2"><Label htmlFor="competitors">Competitor domains</Label><Textarea id="competitors" name="competitors" defaultValue={settings?.competitorDomains.join("\n") || ""} placeholder={'competitor-one.com\ncompetitor-two.com'} /></div>
      <div className="grid gap-4 md:grid-cols-2"><Area label="Audience" name="audience" defaultValue={settings?.audience || ""} /><Area label="Brand voice" name="brandVoice" defaultValue={settings?.brandVoice || ""} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Area label="Thumbnail style" name="thumbnailStyle" defaultValue={settings?.thumbnailStyle || ""} placeholder="Editorial cover art, strong focal point, no embedded text…" />
        <Area label="Inline image style" name="inlineImageStyle" defaultValue={settings?.inlineImageStyle || ""} placeholder="Simple hand-drawn diagrams that explain the adjacent section…" />
      </div>
      <fieldset className="grid gap-4 rounded-xl border p-4 md:grid-cols-3"><legend className="px-2 text-sm font-medium">Hard spend limits (USD)</legend>
        <Field label="Per MCP run" name="perRunBudgetUsd" type="number" min="0.001" step="0.001" defaultValue={usd(settings?.perRunBudgetUsdMicros, .25)} />
        <Field label="Per day (UTC)" name="dailyBudgetUsd" type="number" min="0.001" step="0.001" defaultValue={usd(settings?.dailyBudgetUsdMicros, 1)} />
        <Field label="Per month" name="monthlyBudgetUsd" type="number" min="0.001" step="0.001" defaultValue={usd(settings?.monthlyBudgetUsdMicros, 20)} />
      </fieldset>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save SEO settings"}</Button>
    </CardContent></Card></form>
  </div>;
}

function Field({ label, name, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} required {...props} /></div>; }
function Area({ label, name, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) { return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Textarea id={name} name={name} {...props} /></div>; }
