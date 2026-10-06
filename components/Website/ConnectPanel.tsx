"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Copy, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONNECTORS, destinationName } from "@/lib/publishing/platforms";
import { connectDestination, revealSigningKey, rotateSigningKey } from "@/src/server/services/publishing/actions";

export type ConnectDestination = {
  platform: string;
  method: string;
  siteUrl: string | null;
  status: string;
  statusMessage: string | null;
  endpoint: string | null;
  github: { repo: string; branch: string; contentDir: string; imagesDir: string; imagesPath: string } | null;
};

function CopyField({ id, label, value, mono = true }: { id: string; label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="flex max-w-xl gap-2">
      <Input id={id} aria-label={label} value={value} readOnly className={mono ? "font-mono text-xs" : ""} onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>{copied ? <Check /> : <Copy />}</Button>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-3">
      <span className="flex size-7 items-center justify-center rounded-full border bg-muted/40 text-xs font-medium tabular-nums">{number}</span>
      <div className="min-w-0 space-y-2 pt-1">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** The signing key, fetched for admins; can be replaced. */
function SigningKey({ blogId, label }: { blogId: string; label: string }) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rotating, startRotate] = useTransition();
  useEffect(() => {
    let active = true;
    revealSigningKey(blogId).then((result) => {
      if (!active) return;
      if ("key" in result && result.key) setKey(result.key);
      else setError(result.error ?? "Couldn’t load the key");
    });
    return () => { active = false; };
  }, [blogId]);

  function rotate() {
    if (!window.confirm("Create a new key? Your site stops receiving articles until you paste the new key there.")) return;
    startRotate(async () => {
      const result = await rotateSigningKey(blogId);
      if ("key" in result && result.key) { setKey(result.key); toast.success("New key created. Paste it on your site."); router.refresh(); }
      else toast.error(result.error ?? "Couldn’t create a new key");
    });
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!key) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading key…</p>;
  return (
    <div className="space-y-1.5">
      <CopyField id="zenex-signing-key" label={label} value={key} />
      <button type="button" onClick={rotate} disabled={rotating} className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        <RefreshCw className="size-3" /> Create a new key
      </button>
    </div>
  );
}

/**
 * How to connect the site for the chosen method, ending in "Check connection".
 * Used in Settings → Web integration and as the last onboarding step.
 */
export function ConnectPanel({ blogId, destination, website, onConnected, embedded = false }: {
  blogId: string;
  destination: ConnectDestination;
  /** The website saved for the blog, to prefill the address. */
  website: string | null;
  onConnected?: () => void;
  /** Inside another form (onboarding): no form element of its own. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(destination.status !== "connected" ? destination.statusMessage ?? "" : "");
  const [siteUrl, setSiteUrl] = useState(destination.siteUrl ?? (website ? `https://${website}` : ""));
  const [endpoint, setEndpoint] = useState(destination.endpoint ?? "");
  const [github, setGithub] = useState({
    repo: destination.github?.repo ?? "", branch: destination.github?.branch ?? "main", token: "",
    contentDir: destination.github?.contentDir ?? "content/blog", imagesDir: destination.github?.imagesDir ?? "public/blog", imagesPath: destination.github?.imagesPath ?? "/blog",
  });
  const name = destinationName(destination);

  function check(event?: React.FormEvent) {
    event?.preventDefault();
    setError("");
    startTransition(async () => {
      const input = destination.method === "github" ? { ...github, token: github.token || undefined, siteUrl: siteUrl || undefined }
        : destination.method === "webhook" ? { endpoint, siteUrl: siteUrl || undefined }
          : { siteUrl };
      const result = await connectDestination(blogId, input);
      if ("error" in result && result.error) { setError(result.error); router.refresh(); return; }
      toast.success(`Connected to ${name}. Copying your published articles…`);
      setGithub((current) => ({ ...current, token: "" }));
      router.refresh();
      onConnected?.();
    });
  }

  // Inside another form, a div keeps the markup valid and the button checks without submitting it.
  const wrap = (body: React.ReactNode) => embedded
    ? <div className="space-y-5">{body}</div>
    : <form onSubmit={check} className="space-y-5">{body}</form>;
  const checkButton = (
    <Button type={embedded ? "button" : "submit"} onClick={embedded ? () => check() : undefined} disabled={pending}>
      {pending ? <><Loader2 className="animate-spin" /> Checking…</> : destination.status === "connected" ? "Check again" : "Check connection"}
    </Button>
  );
  const errorLine = error && <p role="alert" className="max-w-xl rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>;

  if (destination.method === "plugin" && (destination.platform === "wordpress" || destination.platform === "prestashop")) {
    const connector = CONNECTORS[destination.platform];
    const install = destination.platform === "wordpress"
      ? "In WordPress, open Plugins → Add New → Upload Plugin, choose the file and activate it."
      : "In PrestaShop, open Modules → Module Manager → Upload a module and choose the file. It installs on its own.";
    // Once connected, only what can change: the key, the address and a new check.
    if (destination.status === "connected") {
      return wrap(
        <>
          <div className="grid max-w-xl gap-1.5">
            <Label htmlFor="zenex-signing-key" className="text-xs text-muted-foreground">Connection key ({connector.settings})</Label>
            <SigningKey blogId={blogId} label="Connection key" />
          </div>
          <div className="grid max-w-xl gap-1.5">
            <Label htmlFor="site-url" className="text-xs text-muted-foreground">Your site</Label>
            <Input id="site-url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://yourwebsite.com" inputMode="url" required />
          </div>
          {errorLine}
          <div className="flex flex-wrap items-center gap-3">
            {checkButton}
            <a href={connector.file} download className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              <Download className="size-3" /> Download {connector.name} again
            </a>
          </div>
        </>,
      );
    }
    return wrap(
      <>
        <ol className="space-y-5">
          <Step number={1} title={`Download ${connector.name}`}>
            <Button variant="outline" size="sm" asChild>
              <a href={connector.file} download><Download /> {connector.file.split("/").pop()}</a>
            </Button>
          </Step>
          <Step number={2} title="Install it on your site">
            <p className="text-sm text-muted-foreground">{install}</p>
          </Step>
          <Step number={3} title={`Paste this key in ${connector.settings}`}>
            <SigningKey blogId={blogId} label="Connection key" />
          </Step>
          <Step number={4} title="Check the connection">
            <div className="grid max-w-xl gap-1.5">
              <Label htmlFor="site-url" className="text-xs text-muted-foreground">Your site</Label>
              <Input id="site-url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://yourwebsite.com" inputMode="url" required />
            </div>
            {errorLine}
            {checkButton}
          </Step>
        </ol>
      </>,
    );
  }

  if (destination.method === "webhook") {
    return wrap(
      <>
        <ol className="space-y-5">
          <Step number={1} title="Add an endpoint to your site">
            <p className="text-sm text-muted-foreground">
              It receives each published article as JSON, signed so you know it comes from Zenex, and stores it wherever you like.{" "}
              <Link href="/docs/webhooks" className="underline underline-offset-4 hover:text-foreground">See the guide and a ready-made Next.js handler</Link>.
            </p>
          </Step>
          <Step number={2} title="Give it this signing key">
            <SigningKey blogId={blogId} label="Signing key" />
            <p className="text-xs text-muted-foreground">Store it as an environment variable, e.g. <code className="font-mono">ZENEX_SIGNING_KEY</code>.</p>
          </Step>
          <Step number={3} title="Send a test request">
            <div className="grid max-w-xl gap-1.5">
              <Label htmlFor="endpoint" className="text-xs text-muted-foreground">Endpoint</Label>
              <Input id="endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://yourwebsite.com/api/zenex" inputMode="url" required />
            </div>
            <div className="grid max-w-xl gap-1.5">
              <Label htmlFor="site-url" className="text-xs text-muted-foreground">Your site (for links to articles)</Label>
              <Input id="site-url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://yourwebsite.com" inputMode="url" />
            </div>
            {errorLine}
            {checkButton}
          </Step>
        </ol>
      </>,
    );
  }

  if (destination.method === "github") {
    const field = (key: keyof typeof github, label: string, placeholder: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
      <div className="grid gap-1.5">
        <Label htmlFor={`github-${key}`} className="text-xs text-muted-foreground">{label}</Label>
        <Input id={`github-${key}`} value={github[key]} onChange={(event) => setGithub((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} {...extra} />
      </div>
    );
    return wrap(
      <>
        <ol className="space-y-5">
          <Step number={1} title="Create an access token">
            <p className="text-sm text-muted-foreground">
              A fine-grained token with access to only this repository and <span className="font-medium text-foreground">Contents: Read and write</span>.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer"><ExternalLink /> Create a token on GitHub</a>
            </Button>
          </Step>
          <Step number={2} title="Tell Zenex where to commit">
            <div className="grid max-w-xl gap-3 sm:grid-cols-[2fr_1fr]">
              {field("repo", "Repository", "owner/website", { required: true })}
              {field("branch", "Branch", "main", { required: true })}
            </div>
            <div className="max-w-xl">
              {field("token", destination.status === "pending" ? "Access token" : "Access token (leave empty to keep the current one)", "github_pat_…", { type: "password", autoComplete: "off", required: destination.status === "pending" && !destination.github?.repo })}
            </div>
            <details className="group max-w-xl">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                Folders <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {field("contentDir", "Articles", "content/blog")}
                {field("imagesDir", "Images", "public/blog")}
                {field("imagesPath", "Images URL", "/blog")}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Articles are saved as <code className="font-mono">{github.contentDir || "content/blog"}/{"{slug}"}.md</code>, one folder per language when the blog has several.</p>
            </details>
            <div className="grid max-w-xl gap-1.5">
              <Label htmlFor="site-url" className="text-xs text-muted-foreground">Your site (for links to articles)</Label>
              <Input id="site-url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://yourwebsite.com" inputMode="url" />
            </div>
          </Step>
          <Step number={3} title="Check the connection">
            {errorLine}
            {checkButton}
          </Step>
        </ol>
      </>,
    );
  }

  return null;
}

/** For sites that read articles from Zenex: what they need, and where the guides are. */
export function ApiReadingPanel({ blogId, publicBlogId, platform }: { blogId: string; publicBlogId: string; platform: string }) {
  const guide = platform === "astro" ? { href: "/docs/astro", label: "Astro guide" } : platform === "nextjs" ? { href: "/docs/nextjs", label: "Next.js guide" } : { href: "/docs/api/posts", label: "API reference" };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Your site asks Zenex for published articles when it renders. Nothing is copied to it, so changes show up without a deploy.</p>
      <div className="grid max-w-xl gap-1.5">
        <Label htmlFor="public-blog-id" className="text-xs text-muted-foreground">Blog ID</Label>
        <CopyField id="public-blog-id" label="Blog ID" value={publicBlogId} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild><Link href={guide.href}>{guide.label}</Link></Button>
        <Button variant="outline" size="sm" asChild><Link href={`/dashboard/blogs/${blogId}/api-keys`}>API keys</Link></Button>
      </div>
    </div>
  );
}
