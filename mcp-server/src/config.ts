export type McpGatewayConfig = {
  host: string;
  port: number;
  cmsUrl: string;
  requestTimeoutMs: number;
  allowedHosts?: string[];
  allowedOrigins: ReadonlySet<string>;
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): McpGatewayConfig {
  const host = environment.HOST?.trim() || "0.0.0.0";
  const port = parsePositiveInteger(environment.PORT, 3200, "PORT");
  const requestTimeoutMs = parsePositiveInteger(
    environment.MCP_REQUEST_TIMEOUT_MS,
    30_000,
    "MCP_REQUEST_TIMEOUT_MS",
  );

  return {
    host,
    port,
    cmsUrl: parseCmsUrl(environment.ZENEX_CMS_URL),
    requestTimeoutMs,
    allowedHosts: parseList(environment.MCP_ALLOWED_HOSTS),
    allowedOrigins: new Set(parseList(environment.MCP_ALLOWED_ORIGINS) ?? []),
  };
}

function parseCmsUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim();
  if (!value) throw new Error("ZENEX_CMS_URL is required");

  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("ZENEX_CMS_URL must use https:// except on localhost");
  }
  return url.origin;
}

function parseList(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!rawValue) return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
