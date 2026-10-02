import OpenAI, { type ClientOptions } from "openai";
import { prisma } from "@/lib/prisma";
import { resolveBlogOpenAiAccess, type OpenAiAccess, type PaidBy } from "@/src/server/services/providers/credentials";

/** What a request was made for; the Usage page groups spend by it. */
export type AiFeature = "article" | "discovery" | "brand_voice" | "cover_refresh" | "image_preview" | "translation";
export type AiUsageContext = { blogId: string; feature: AiFeature; paidBy: PaidBy };

/**
 * OpenAI standard prices in USD per 1M tokens, which is also micro-USD per token.
 * Image models charge image input and output (the image itself) separately.
 */
type Price = { input: number; cachedInput: number; output: number; imageInput?: number };
export const OPENAI_PRICES: Record<string, Price> = {
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-image-1": { input: 5, cachedInput: 1.25, imageInput: 10, output: 40 },
  "gpt-image-1-mini": { input: 2, cachedInput: 0.2, imageInput: 2.5, output: 8 },
  "gpt-image-1.5": { input: 5, cachedInput: 1.25, imageInput: 8, output: 32 },
  "gpt-image-2": { input: 5, cachedInput: 1.25, imageInput: 8, output: 30 },
};

/** The price of a model, also for dated snapshots such as gpt-4.1-mini-2025-04-14. */
export function priceFor(model: string): Price | null {
  const name = model.toLowerCase();
  if (OPENAI_PRICES[name]) return OPENAI_PRICES[name];
  const base = Object.keys(OPENAI_PRICES).filter(key => name.startsWith(`${key}-`)).sort((a, b) => b.length - a.length)[0];
  return base ? OPENAI_PRICES[base] : null;
}

export type TokenUsage = { inputTokens: number; cachedInputTokens: number; imageInputTokens: number; outputTokens: number };

export function costUsdMicros(model: string, usage: TokenUsage) {
  const price = priceFor(model);
  if (!price) return null;
  const textInput = Math.max(0, usage.inputTokens - usage.imageInputTokens - usage.cachedInputTokens);
  return Math.round(
    textInput * price.input + usage.cachedInputTokens * price.cachedInput
    + usage.imageInputTokens * (price.imageInput ?? price.input) + usage.outputTokens * price.output,
  );
}

const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

/** Token counts from a Responses, Chat Completions or Images API response body. */
export function tokenUsage(body: Record<string, unknown>): TokenUsage | null {
  const usage = body.usage as Record<string, unknown> | undefined;
  if (!usage) return null;
  const details = (usage.input_tokens_details ?? usage.prompt_tokens_details ?? {}) as Record<string, unknown>;
  return {
    inputTokens: count(usage.input_tokens ?? usage.prompt_tokens),
    cachedInputTokens: count(details.cached_tokens),
    imageInputTokens: count(details.image_tokens),
    outputTokens: count(usage.output_tokens ?? usage.completion_tokens),
  };
}

/** Image responses do not name their model, so it is read from the request. */
function requestModel(init: RequestInit | undefined) {
  const body = init?.body;
  if (typeof body === "string") {
    try { return (JSON.parse(body) as { model?: unknown }).model as string | undefined; } catch { return undefined; }
  }
  if (body instanceof FormData) return body.get("model")?.toString();
  return undefined;
}

async function recordUsage(context: AiUsageContext, url: string, init: RequestInit | undefined, response: Response) {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return;
  const body = await response.json() as Record<string, unknown>;
  const usage = tokenUsage(body);
  if (!usage) return;
  const model = (typeof body.model === "string" ? body.model : requestModel(init)) || "unknown";
  await prisma.aiUsageEntry.create({ data: {
    blogId: context.blogId, feature: context.feature, paidBy: context.paidBy,
    kind: new URL(url).pathname.includes("/images/") ? "image" : "text",
    model, ...usage, costUsdMicros: costUsdMicros(model, usage),
  } });
}

/** An OpenAI client that records the tokens and cost of every successful request. */
export function trackedOpenAI(access: OpenAiAccess, context: Omit<AiUsageContext, "paidBy">, options: Omit<ClientOptions, "apiKey" | "fetch"> = {}) {
  const usageContext = { ...context, paidBy: access.paidBy };
  return new OpenAI({
    ...options,
    apiKey: access.apiKey,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const response = await fetch(input, init);
      if (response.ok) {
        const url = input instanceof Request ? input.url : String(input);
        // Usage is bookkeeping: a failure to record it never fails the AI request.
        await recordUsage(usageContext, url, init, response.clone()).catch(error => {
          console.error("[Usage] openai-record-failed", { feature: context.feature, error: error instanceof Error ? error.message : String(error) });
        });
      }
      return response;
    },
  });
}

/** The OpenAI client for work on a blog, paid by whoever the owner's plan says. */
export async function blogOpenAI(blogId: string, feature: AiFeature, options: Omit<ClientOptions, "apiKey" | "fetch"> = {}) {
  return trackedOpenAI(await resolveBlogOpenAiAccess(blogId), { blogId, feature }, options);
}
