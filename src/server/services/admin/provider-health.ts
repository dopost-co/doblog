import OpenAI from "openai";
import { ApiError } from "@/lib/integrations/errors";
import { verifyDataForSeoCredentials } from "@/src/server/services/seo/dataforseo";

/** Below this the admin panel warns that Subscription research will soon stop. */
export const LOW_DATAFORSEO_BALANCE_USD = 5;

export type ProviderHealth =
  | { status: "ok"; balanceUsd?: number | null; low?: boolean }
  | { status: "missing" | "rejected" | "no_credit" | "unreachable"; message: string };

/**
 * Whether the platform keys Subscription accounts use actually work. Both
 * checks are free: OpenAI lists models and DataForSEO reads the account.
 */
export async function checkPlatformProviders(): Promise<{ openai: ProviderHealth; dataforseo: ProviderHealth }> {
  const [openai, dataforseo] = await Promise.all([checkOpenAi(), checkDataForSeo()]);
  return { openai, dataforseo };
}

async function checkOpenAi(): Promise<ProviderHealth> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { status: "missing", message: "OPENAI_API_KEY is not set" };
  try {
    await new OpenAI({ apiKey, timeout: 10_000, maxRetries: 0 }).models.list();
    return { status: "ok" };
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
      return { status: "rejected", message: "OpenAI rejected the key. Create a new one at platform.openai.com/api-keys" };
    }
    if (error instanceof OpenAI.APIError && error.status) return { status: "unreachable", message: `OpenAI answered with an error (${error.status})` };
    return { status: "unreachable", message: "OpenAI could not be reached" };
  }
}

async function checkDataForSeo(): Promise<ProviderHealth> {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) return { status: "missing", message: "DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD is not set" };
  try {
    const { balanceUsd } = await verifyDataForSeoCredentials({ login, password });
    if (balanceUsd !== null && balanceUsd <= 0) return { status: "no_credit", message: "The DataForSEO balance is used up. Add funds at app.dataforseo.com" };
    return { status: "ok", balanceUsd, low: balanceUsd !== null && balanceUsd < LOW_DATAFORSEO_BALANCE_USD };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DataForSEO could not be checked";
    if (error instanceof ApiError && error.status === 401) return { status: "rejected", message };
    if (error instanceof ApiError && error.status === 402) return { status: "no_credit", message };
    return { status: "unreachable", message };
  }
}
