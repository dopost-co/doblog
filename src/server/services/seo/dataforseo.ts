import { ApiError } from "@/lib/integrations/errors";

const API_BASE = "https://api.dataforseo.com";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export type DataForSeoCredentials = { login: string; password: string };
type DataForSeoResponse = {
  status_code?: number; status_message?: string; cost?: number;
  tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number; result?: unknown[] }>;
};

/** DataForSEO status codes worth a plain explanation (https://docs.dataforseo.com/v3/appendix/errors). */
function providerError(httpStatus: number, code: number | undefined, message: string | undefined) {
  if (code === 40200 || code === 40210) return new ApiError(402, "DataForSEO balance is used up. Add funds at app.dataforseo.com");
  if (httpStatus === 401 || code === 40100 || code === 40101) return new ApiError(401, "DataForSEO rejected the login. Use the API login and API password from app.dataforseo.com/api-access");
  if (code === 40202 || httpStatus === 429) return new ApiError(429, "DataForSEO rate limit reached. Try again in a minute");
  return new ApiError(502, message || `DataForSEO request failed (${httpStatus})`);
}

export async function dataForSeoRequest(credentials: DataForSeoCredentials, endpoint: string, body?: unknown) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
    redirect: "error",
    cache: "no-store",
  }).catch((error: unknown) => {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ApiError(504, timedOut ? "DataForSEO did not answer within 25 seconds" : "DataForSEO could not be reached");
  });
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new ApiError(502, "DataForSEO response exceeded the safety limit");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new ApiError(502, "DataForSEO response exceeded the safety limit");
  let data: DataForSeoResponse;
  try { data = JSON.parse(text) as DataForSeoResponse; }
  catch { throw new ApiError(502, "DataForSEO returned an invalid response"); }
  if (!response.ok || data.status_code !== 20000) throw providerError(response.status, data.status_code, data.status_message);
  const failedTask = data.tasks?.find(task => task.status_code && task.status_code !== 20000);
  if (failedTask) throw providerError(response.status, failedTask.status_code, failedTask.status_message || "DataForSEO task failed");
  return data;
}

export function responseCostMicros(data: DataForSeoResponse) {
  const taskCost = data.tasks?.reduce((total, task) => total + Number(task.cost || 0), 0);
  const cost = taskCost === undefined || taskCost === 0 ? Number(data.cost || 0) : taskCost;
  return Math.max(0, Math.round(cost * 1_000_000));
}

export async function verifyDataForSeoCredentials(credentials: DataForSeoCredentials) {
  const response = await dataForSeoRequest(credentials, "/v3/appendix/user_data");
  const result = response.tasks?.[0]?.result?.[0] as Record<string, unknown> | undefined;
  const money = result?.money as { balance?: unknown } | undefined;
  return { valid: true, balanceUsd: typeof money?.balance === "number" ? money.balance : null };
}
