import { formatUsd } from "./format";
import type { ProviderUsage, UsageReport as Report } from "@/src/server/services/usage/queries";

function ProviderCard({ title, note, usage, footnote }: { title: string; note: string; usage: ProviderUsage; footnote?: string }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground">{note}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums">{formatUsd(usage.costUsdMicros)}</p>
          <p className="text-xs text-muted-foreground">{usage.requests} {usage.requests === 1 ? "request" : "requests"}</p>
        </div>
      </div>
      {usage.lines.length > 0 && (
        <ul className="divide-y border-t text-sm">
          {usage.lines.map((line) => (
            <li key={line.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span>{line.label}</span>
              <span className="flex items-center gap-4 tabular-nums">
                <span className="text-xs text-muted-foreground">{line.requests}×</span>
                <span className="w-20 text-right">{formatUsd(line.costUsdMicros)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {footnote && <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{footnote}</p>}
    </section>
  );
}

/** Spend per provider and per blog for one month. */
export function UsageReport({ report, blogs, payerNote }: {
  report: Report;
  blogs: { id: string; name: string }[];
  /** Who pays, in one sentence; the same for both providers. */
  payerNote: string;
}) {
  const { openai, dataforseo } = report;
  const openAiFootnotes = [
    "Estimated from the tokens each request used and OpenAI's list prices.",
    openai.unpricedRequests ? `${openai.unpricedRequests} ${openai.unpricedRequests === 1 ? "request uses a model" : "requests use models"} without a known price and count as $0.` : "",
  ].filter(Boolean).join(" ");
  const seoFootnote = [
    "As reported by DataForSEO for each request.",
    dataforseo.cacheHits ? `${dataforseo.cacheHits} repeated ${dataforseo.cacheHits === 1 ? "lookup was" : "lookups were"} answered from cache for free.` : "",
  ].filter(Boolean).join(" ");
  const blogRows = blogs.map((blog) => ({ ...blog, spend: report.byBlog.get(blog.id) ?? { openai: 0, dataforseo: 0 } }))
    .filter((blog) => blog.spend.openai + blog.spend.dataforseo > 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{payerNote}</p>
      <ProviderCard title="OpenAI" note="Writing, ideas, images and translations" usage={openai} footnote={openAiFootnotes} />
      <ProviderCard title="DataForSEO" note="Keyword and search research" usage={dataforseo} footnote={seoFootnote} />
      {blogs.length > 1 && blogRows.length > 0 && (
        <section className="rounded-lg border bg-card">
          <h3 className="px-4 py-3 text-sm font-medium">By blog</h3>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-2 font-normal">Blog</th><th className="px-4 py-2 text-right font-normal">OpenAI</th><th className="px-4 py-2 text-right font-normal">DataForSEO</th></tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {blogRows.map((blog) => (
                  <tr key={blog.id}>
                    <td className="px-4 py-2.5">{blog.name}</td>
                    <td className="px-4 py-2.5 text-right">{formatUsd(blog.spend.openai)}</td>
                    <td className="px-4 py-2.5 text-right">{formatUsd(blog.spend.dataforseo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
