import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/integrations/errors";
import { isManagedPlan, resolveDataForSeoAccess } from "@/src/server/services/providers/credentials";
import { dataForSeoRequest, responseCostMicros } from "./dataforseo";

export type SeoOperation = "keyword_ideas" | "search_intent" | "serp_brief";
const POLICY: Record<SeoOperation, { endpoint: string; ttlMs: number; estimateMicros: number }> = {
  keyword_ideas: { endpoint: "/v3/dataforseo_labs/google/keyword_ideas/live", ttlMs: 30 * 86400_000, estimateMicros: 50_000 },
  search_intent: { endpoint: "/v3/dataforseo_labs/google/search_intent/live", ttlMs: 30 * 86400_000, estimateMicros: 10_000 },
  serp_brief: { endpoint: "/v3/serp/google/organic/live/advanced", ttlMs: 48 * 3600_000, estimateMicros: 3_000 },
};

const stable = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`
    : JSON.stringify(value);

const microsToUsd = (value: number) => Number((value / 1_000_000).toFixed(6));
const firstResult = (data: Record<string, unknown>) => ((data.tasks as Array<Record<string, unknown>> | undefined)?.[0]?.result as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;

export function normalizeSeoResponse(operation: SeoOperation, raw: Record<string, unknown>) {
  const result = firstResult(raw) || {};
  const items = Array.isArray(result.items) ? result.items as Array<Record<string, unknown>> : [];
  if (operation === "keyword_ideas") return {
    totalCount: Number(result.total_count || items.length),
    items: items.slice(0, 50).map(item => {
      // keyword_ideas returns fields directly on each item. Keep the nested
      // fallback for compatible DataForSEO Labs endpoints that use keyword_data.
      const keywordData = (item.keyword_data || item) as Record<string, unknown>;
      const info = (keywordData.keyword_info || {}) as Record<string, unknown>;
      const props = (keywordData.keyword_properties || {}) as Record<string, unknown>;
      const intent = (keywordData.search_intent_info || {}) as Record<string, unknown>;
      return { keyword: keywordData.keyword, searchVolume: info.search_volume, cpc: info.cpc, competition: info.competition_level, difficulty: props.keyword_difficulty, intent: intent.main_intent };
    }),
  };
  if (operation === "search_intent") return {
    items: items.slice(0, 100).map(item => ({ keyword: item.keyword, intent: item.keyword_intent })),
  };
  const organic = items.filter(item => item.type === "organic").slice(0, 10).map(item => ({
    rank: item.rank_absolute, title: item.title, url: item.url, domain: item.domain, description: item.description,
  }));
  const questions = items.filter(item => item.type === "people_also_ask").flatMap(item => {
    const entries = Array.isArray(item.items) ? item.items as Array<Record<string, unknown>> : [];
    return entries.map(entry => entry.title || entry.question).filter(Boolean);
  }).slice(0, 10);
  return { keyword: result.keyword, organic, peopleAlsoAsk: questions };
}

async function usageSince(blogId: string, since: Date) {
  const usage = await prisma.seoUsageEntry.aggregate({ where: { blogId, createdAt: { gte: since }, status: { in: ["reserved", "completed"] } }, _sum: { costUsdMicros: true } });
  return usage._sum.costUsdMicros || 0;
}

export async function getSeoSettingsSummary(blogId: string) {
  const [settings, blog] = await Promise.all([
    prisma.blogSeoSettings.findUnique({ where: { blogId }, include: { credential: { select: { label: true, loginHint: true, verifiedAt: true } } } }),
    prisma.blog.findUnique({ where: { id: blogId }, select: { user: { select: { plan: true } } } }),
  ]);
  const managed = isManagedPlan(blog?.user.plan);
  if (!settings) return { configured: managed, enabled: false };
  return {
    configured: managed || !!settings.credentialId, enabled: settings.enabled, targetDomain: settings.targetDomain,
    locationCode: settings.locationCode, languageCode: settings.languageCode, timezone: settings.timezone,
    competitorDomains: settings.competitorDomains, audience: settings.audience, brandVoice: settings.brandVoice,
    publishingMode: settings.publishingMode,
    thumbnailStyle: settings.thumbnailStyle,
    inlineImageStyle: settings.inlineImageStyle,
    maxInlineImages: settings.maxInlineImages,
    articleUrlPrefix: settings.articleUrlPrefix,
    sitemapUrl: settings.sitemapUrl,
    discoveryEnabled: settings.discoveryEnabled,
    discoveryFrequency: settings.discoveryFrequency,
    discoveryTopicsPerRun: settings.discoveryTopicsPerRun,
    draftAutomationEnabled: settings.draftAutomationEnabled,
    draftsPerWeek: settings.draftsPerWeek,
    nextDiscoveryAt: settings.nextDiscoveryAt?.toISOString() || null,
    lastDiscoveryAt: settings.lastDiscoveryAt?.toISOString() || null,
    imagePolicy: "Create one distinct thumbnail when authoring a complete article. Add zero to maxInlineImages images inside the content only when each one explains something useful; the thumbnail does not count toward this maximum and must not be reused as an inline image.",
    budgetsUsd: { perRun: microsToUsd(settings.perRunBudgetUsdMicros), daily: microsToUsd(settings.dailyBudgetUsdMicros), monthly: microsToUsd(settings.monthlyBudgetUsdMicros) },
    credential: settings.credential ? { label: settings.credential.label, loginHint: settings.credential.loginHint, verified: !!settings.credential.verifiedAt } : null,
  };
}

export const seoEditorialSettingsFields = {
  targetDomain: z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).nullable().optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().trim().min(2).max(10).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  competitorDomains: z.array(z.string().trim().toLowerCase().max(253)).max(20).optional(),
  audience: z.string().trim().max(2000).nullable().optional(),
  brandVoice: z.string().trim().max(2000).nullable().optional(),
  publishingMode: z.enum(["draft", "review", "auto_publish"]).optional(),
  thumbnailStyle: z.string().trim().max(1000).nullable().optional(),
  inlineImageStyle: z.string().trim().max(1000).nullable().optional(),
  maxInlineImages: z.number().int().min(0).max(8).optional(),
  articleUrlPrefix: z.string().trim().startsWith("/").max(200).optional(),
} satisfies z.ZodRawShape;

export const seoEditorialSettingsSchema = z.object(seoEditorialSettingsFields).strict().refine(value => Object.keys(value).length > 0, "Provide at least one setting").superRefine((value, ctx) => {
  if (value.timezone) {
    try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); }
    catch { ctx.addIssue({ code: "custom", message: "Invalid timezone", path: ["timezone"] }); }
  }
});

export async function updateSeoEditorialSettings(blogId: string, input: unknown) {
  const data = seoEditorialSettingsSchema.parse(input);
  await prisma.blogSeoSettings.upsert({ where: { blogId }, create: { blogId, ...data }, update: data });
  return getSeoSettingsSummary(blogId);
}

export async function getSeoUsage(blogId: string) {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [daily, monthly, calls, cacheHits] = await Promise.all([
    usageSince(blogId, day), usageSince(blogId, month),
    prisma.seoUsageEntry.count({ where: { blogId, createdAt: { gte: month }, status: "completed" } }),
    prisma.seoUsageEntry.count({ where: { blogId, createdAt: { gte: month }, cacheHit: true } }),
  ]);
  return { period: "UTC", dailyCostUsd: microsToUsd(daily), monthlyCostUsd: microsToUsd(monthly), callsThisMonth: calls, cacheHitsThisMonth: cacheHits };
}

export async function runSeoOperation(blogId: string, operation: SeoOperation, input: Record<string, unknown>) {
  const policy = POLICY[operation];
  const settings = await prisma.blogSeoSettings.findUnique({ where: { blogId } });
  if (!settings?.enabled) throw new ApiError(409, "SEO research is not enabled for this blog");
  const access = await resolveDataForSeoAccess(blogId);
  if (policy.estimateMicros > settings.perRunBudgetUsdMicros) throw new ApiError(429, "This request exceeds the per-run SEO budget");

  const payload = operation === "serp_brief" ? [{ ...input, location_code: settings.locationCode, language_code: settings.languageCode, depth: 10 }]
    : [{ ...input, location_code: settings.locationCode, language_code: settings.languageCode }];
  const payloadHash = createHash("sha256").update(`${access.cacheScope}:${stable(payload)}`).digest("hex");
  const cached = await prisma.seoCacheEntry.findUnique({ where: { blogId_endpoint_payloadHash: { blogId, endpoint: policy.endpoint, payloadHash } } });
  if (cached && cached.expiresAt > new Date()) {
    await prisma.seoUsageEntry.create({ data: { blogId, credentialId: access.credentialId, endpoint: policy.endpoint, costUsdMicros: 0, cacheHit: true, status: "completed", completedAt: new Date() } });
    return { data: cached.response, cacheHit: true, actualCostUsd: 0, snapshotAt: cached.updatedAt.toISOString() };
  }

  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [daily, monthly] = await Promise.all([usageSince(blogId, day), usageSince(blogId, month)]);
  if (daily + policy.estimateMicros > settings.dailyBudgetUsdMicros || monthly + policy.estimateMicros > settings.monthlyBudgetUsdMicros) throw new ApiError(429, "SEO budget reached for this blog");
  const reservation = await prisma.seoUsageEntry.create({ data: { blogId, credentialId: access.credentialId, endpoint: policy.endpoint, costUsdMicros: policy.estimateMicros } });
  try {
    const raw = await dataForSeoRequest({ login: access.login, password: access.password }, policy.endpoint, payload);
    const actualCost = responseCostMicros(raw);
    const normalized = JSON.parse(JSON.stringify(normalizeSeoResponse(operation, raw as unknown as Record<string, unknown>)));
    await prisma.$transaction([
      prisma.seoUsageEntry.update({ where: { id: reservation.id }, data: { costUsdMicros: actualCost, providerTaskId: raw.tasks?.[0]?.id, status: "completed", completedAt: new Date() } }),
      prisma.seoCacheEntry.upsert({ where: { blogId_endpoint_payloadHash: { blogId, endpoint: policy.endpoint, payloadHash } }, create: { blogId, endpoint: policy.endpoint, payloadHash, response: normalized, expiresAt: new Date(Date.now() + policy.ttlMs) }, update: { response: normalized, expiresAt: new Date(Date.now() + policy.ttlMs) } }),
    ]);
    return { data: normalized, cacheHit: false, actualCostUsd: microsToUsd(actualCost), snapshotAt: new Date().toISOString() };
  } catch (error) {
    await prisma.seoUsageEntry.update({ where: { id: reservation.id }, data: { costUsdMicros: 0, status: "failed", completedAt: new Date() } }).catch(() => undefined);
    throw error;
  }
}
