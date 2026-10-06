import { DocsLayout } from "@/components/Docs/DocsLayout";
import { DocsSidebar } from "@/components/Docs/DocsSidebar";
import { DocsSection } from "@/components/Docs/DocsSection";
import { DocsCodeBlock } from "@/components/Docs/DocsCodeBlock";
import { ASTRO_COLLECTION, MARKDOWN_EXAMPLE, UPSERT_EXAMPLE, WEBHOOK_HANDLER } from "@/lib/publishing/examples";

export const metadata = { title: "Publishing to your website" };

const code = "rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground";

export default function PublishingDocsPage() {
  return (
    <DocsLayout>
      <DocsSidebar />
      <main className="relative py-6 lg:gap-10 lg:py-8">
        <div className="mx-auto w-full min-w-0 max-w-3xl">
          <div className="mb-8 space-y-2">
            <h1 className="scroll-m-20 text-4xl font-bold tracking-tight">Publishing to your website</h1>
            <p className="text-lg text-muted-foreground">
              Zenex can copy every published article to your site, so the site never depends on Zenex to show it. Choose how in your blog → Settings → Web integration.
            </p>
          </div>

          <DocsSection id="how" title="How it works">
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li><span className="text-foreground">Zenex is the source of truth.</span> Publishing an article sends it; editing it sends it again; unpublishing or deleting it removes the copy.</li>
              <li><span className="text-foreground">Nothing is lost when your site is down.</span> Failed deliveries are retried with growing pauses (up to once a day), and Settings → Web integration shows what failed and why.</li>
              <li><span className="text-foreground">Copies are keyed by the article id,</span> so a repeated delivery updates the same copy instead of creating another.</li>
              <li><span className="text-foreground">Links between articles</span> use the article address your site reports when you connect it.</li>
            </ul>
          </DocsSection>

          <DocsSection id="wordpress" title="WordPress">
            <p className="text-muted-foreground">
              Install the Zenex plugin (Website → Download), paste the connection key in <span className="text-foreground">Settings → Zenex</span> and check the connection.
              Each article becomes a regular post: images go to your media library, the cover becomes the featured image, categories and tags are created as needed,
              and SEO fields go to Yoast SEO, Rank Math or SEOPress. With Polylang, every language is published and translations are linked; without it, only the main language is sent.
              Removed articles go to the trash.
            </p>
          </DocsSection>

          <DocsSection id="prestashop" title="PrestaShop">
            <p className="text-muted-foreground">
              Upload the Zenex Blog module in <span className="text-foreground">Modules → Module Manager</span>, paste the key in its configuration and check the connection.
              The module adds a blog to your store at <code className={code}>/blog</code> (you can change the path), in every language the store has, with its own pages,
              meta tags, hreflang links and entries in the Google sitemap module. It needs PrestaShop 1.7.6 or later.
            </p>
          </DocsSection>

          <DocsSection id="github" title="GitHub (Next.js, Astro and other static sites)">
            <p className="text-muted-foreground">
              Zenex commits each article as Markdown to your repository: <code className={code}>content/blog/{"{slug}"}.md</code>, or
              <code className={code}>content/blog/{"{language}"}/{"{slug}"}.md</code> when the blog has several languages. Images are committed to
              <code className={code}>public/blog</code> and referenced as <code className={code}>/blog/…</code>. Your host redeploys on each commit.
              Use a fine-grained token limited to the repository with <span className="text-foreground">Contents: Read and write</span>.
            </p>
            <DocsCodeBlock code={MARKDOWN_EXAMPLE} language="markdown" filename="content/blog/how-to-plan-a-content-calendar.md" />
            <p className="text-muted-foreground">In Astro, a content collection reads these files directly:</p>
            <DocsCodeBlock code={ASTRO_COLLECTION} language="typescript" filename="src/content.config.ts" />
          </DocsSection>

          <DocsSection id="webhook" title="Webhook">
            <p className="text-muted-foreground">
              For anything else, Zenex sends each change to an endpoint you build, as a <code className={code}>POST</code> with a JSON body and these headers:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li><code className={code}>X-Zenex-Event</code>: <code className={code}>ping</code>, <code className={code}>post.upsert</code> or <code className={code}>post.delete</code></li>
              <li><code className={code}>X-Zenex-Timestamp</code>: Unix time in seconds</li>
              <li><code className={code}>X-Zenex-Signature</code>: <code className={code}>v1=</code> followed by the hex HMAC-SHA256 of <code className={code}>{"{timestamp}.{raw body}"}</code> with your signing key</li>
            </ul>
            <p className="text-muted-foreground">
              Reject requests whose signature doesn’t match or whose timestamp is more than 5 minutes off. Answer with any 2xx status; for
              <code className={code}>post.upsert</code> you can return <code className={code}>{`{ "url": "…" }`}</code> so Zenex links to the article on your site.
              Any other status is retried. <code className={code}>ping</code> is sent when you check the connection.
            </p>
            <DocsCodeBlock code={WEBHOOK_HANDLER} language="typescript" filename="app/api/zenex/route.ts" />
            <DocsCodeBlock code={UPSERT_EXAMPLE} language="json" filename="post.upsert body" />
            <p className="text-muted-foreground">
              <code className={code}>post.delete</code> carries <code className={code}>article.id</code>, <code className={code}>article.language</code> and the
              <code className={code}>remoteId</code> you returned, if any.
            </p>
          </DocsSection>
        </div>
      </main>
    </DocsLayout>
  );
}
