import { prisma } from "@/lib/prisma";
import type { PaidBy } from "@/src/server/services/providers/credentials";

/** A calendar month in UTC, the period provider bills follow. */
export type UsageMonth = { key: string; label: string; start: Date; end: Date };

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const monthLabel = (start: Date) => start.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });

function monthStarting(year: number, monthIndex: number): UsageMonth {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, label: monthLabel(start), start, end };
}

/** The month in a `?month=2026-10` value; anything else (or a future month) is the current month. */
export function parseUsageMonth(value: string | string[] | undefined, now = new Date()): UsageMonth {
  const current = monthStarting(now.getUTCFullYear(), now.getUTCMonth());
  const match = typeof value === "string" ? MONTH_KEY.exec(value) : null;
  if (!match) return current;
  const month = monthStarting(Number(match[1]), Number(match[2]) - 1);
  return month.start > current.start ? current : month;
}

/** The current month and the ones before it, newest first. */
export function recentUsageMonths(count = 12, now = new Date()) {
  return Array.from({ length: count }, (_, index) => monthStarting(now.getUTCFullYear(), now.getUTCMonth() - index))
    .map(({ key, label }) => ({ key, label }));
}

export const AI_FEATURE_LABELS: Record<string, string> = {
  article: "Articles",
  discovery: "Topic ideas",
  translation: "Translations",
  cover_refresh: "Cover redraws",
  image_preview: "Image previews",
  brand_voice: "Brand voice",
};

const SEO_ENDPOINT_LABELS: Array<[string, string]> = [
  ["/keyword_ideas/", "Keyword ideas"],
  ["/ranked_keywords/", "Your rankings"],
  ["/domain_intersection/", "Competitor gaps"],
  ["/search_intent/", "Search intent"],
  ["/serp/", "Search result briefs"],
];
const seoOperationLabel = (endpoint: string) => SEO_ENDPOINT_LABELS.find(([fragment]) => endpoint.includes(fragment))?.[1] ?? "Other";

export type UsageLine = { label: string; requests: number; costUsdMicros: number };
export type ProviderUsage = {
  costUsdMicros: number; requests: number; byPaidBy: Record<PaidBy, number>; lines: UsageLine[];
};
export type UsageReport = {
  openai: ProviderUsage & { unpricedRequests: number };
  dataforseo: ProviderUsage & { cacheHits: number };
  byBlog: Map<string, { openai: number; dataforseo: number }>;
};

function addLine(lines: Map<string, UsageLine>, label: string, requests: number, cost: number) {
  const line = lines.get(label) ?? { label, requests: 0, costUsdMicros: 0 };
  line.requests += requests;
  line.costUsdMicros += cost;
  lines.set(label, line);
}

const sortedLines = (lines: Map<string, UsageLine>) => [...lines.values()].sort((a, b) => b.costUsdMicros - a.costUsdMicros || b.requests - a.requests);

/** OpenAI and DataForSEO spend of some blogs in one month. Pass no ids for every blog. */
export async function getUsageReport(month: UsageMonth, blogIds?: string[]): Promise<UsageReport> {
  const blogFilter = blogIds ? { blogId: { in: blogIds } } : {};
  const createdAt = { gte: month.start, lt: month.end };
  const [ai, seo, cacheHits] = await Promise.all([
    prisma.aiUsageEntry.groupBy({
      by: ["blogId", "feature", "paidBy"], where: { ...blogFilter, createdAt },
      _count: { _all: true }, _sum: { costUsdMicros: true },
    }),
    prisma.seoUsageEntry.groupBy({
      by: ["blogId", "endpoint", "credentialId"], where: { ...blogFilter, createdAt, status: "completed", cacheHit: false },
      _count: { _all: true }, _sum: { costUsdMicros: true },
    }),
    prisma.seoUsageEntry.count({ where: { ...blogFilter, createdAt, cacheHit: true } }),
  ]);
  const unpricedRequests = await prisma.aiUsageEntry.count({ where: { ...blogFilter, createdAt, costUsdMicros: null } });

  const byBlog = new Map<string, { openai: number; dataforseo: number }>();
  const blogTotals = (blogId: string) => byBlog.get(blogId) ?? byBlog.set(blogId, { openai: 0, dataforseo: 0 }).get(blogId)!;

  const aiLines = new Map<string, UsageLine>();
  const openai = { costUsdMicros: 0, requests: 0, byPaidBy: { platform: 0, owner: 0 }, lines: [] as UsageLine[], unpricedRequests };
  for (const row of ai) {
    const cost = row._sum.costUsdMicros ?? 0;
    openai.costUsdMicros += cost;
    openai.requests += row._count._all;
    openai.byPaidBy[row.paidBy === "platform" ? "platform" : "owner"] += cost;
    addLine(aiLines, AI_FEATURE_LABELS[row.feature] ?? row.feature, row._count._all, cost);
    blogTotals(row.blogId).openai += cost;
  }
  openai.lines = sortedLines(aiLines);

  const seoLines = new Map<string, UsageLine>();
  const dataforseo = { costUsdMicros: 0, requests: 0, byPaidBy: { platform: 0, owner: 0 }, lines: [] as UsageLine[], cacheHits };
  for (const row of seo) {
    const cost = row._sum.costUsdMicros ?? 0;
    dataforseo.costUsdMicros += cost;
    dataforseo.requests += row._count._all;
    // Without a connection of the owner's, the platform account paid.
    dataforseo.byPaidBy[row.credentialId ? "owner" : "platform"] += cost;
    addLine(seoLines, seoOperationLabel(row.endpoint), row._count._all, cost);
    blogTotals(row.blogId).dataforseo += cost;
  }
  dataforseo.lines = sortedLines(seoLines);

  return { openai, dataforseo, byBlog };
}

/** Whether the platform keys subscribers rely on are configured. */
export function platformProviderStatus() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    dataforseo: Boolean(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim()),
  };
}
