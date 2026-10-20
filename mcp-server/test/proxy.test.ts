import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import type { McpGatewayConfig } from "../src/config.js";
import type { Logger } from "../src/observability/logger.js";
import { createProxyApp } from "../src/transport/proxy.js";

const silentLogger: Logger = {
  info() {},
  error() {},
};

test("health is public while the MCP endpoint requires Bearer auth", async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig("https://cms.invalid"));
  t.after(() => closeServer(server));

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    status: "ok",
    service: "zenex-mcp-gateway",
    transport: "streamable-http",
  });

  const unauthorized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("www-authenticate") ?? "", /^Bearer/);
  assert.match(
    unauthorized.headers.get("www-authenticate") ?? "",
    /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/,
  );
});

test("health bypasses the public Host allowlist for container probes", async (t) => {
  const config = baseConfig("https://cms.invalid");
  config.allowedHosts = ["mcp.example.com"];
  const { server, baseUrl } = await listenApp(config);
  t.after(() => closeServer(server));

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
});

test("unauthenticated GET probes discover OAuth on both MCP endpoints", async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig("https://cms.invalid"));
  t.after(() => closeServer(server));
  for (const path of ["/", "/mcp"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /resource_metadata=/);
  }
});

test("GET probes validate existing tokens upstream before rejecting SSE", async (t) => {
  const upstream = createServer((req, res) => {
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/api/mcp");
    const valid = req.headers.authorization === "Bearer znx_at_valid";
    res.statusCode = valid ? 405 : 401;
    if (valid) res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ error: valid ? "Use POST" : "Invalid token" }));
  });
  t.after(() => closeServer(upstream));
  const { server, baseUrl } = await listenApp(baseConfig(await listen(upstream)));
  t.after(() => closeServer(server));
  for (const [token, status] of [["expired", 401], ["valid", 405]] as const) {
    const response = await fetch(`${baseUrl}/mcp`, { headers: { Authorization: `Bearer znx_at_${token}` } });
    assert.equal(response.status, status);
    if (status === 401) assert.match(response.headers.get("www-authenticate") ?? "", /error="invalid_token"/);
    else assert.equal(response.headers.get("allow"), "POST");
  }
});

test("advertises the CMS as the authorization server for its own protected-resource metadata", async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig("https://cms.invalid"));
  t.after(() => closeServer(server));

  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      resource: string;
      authorization_servers: string[];
    };
    assert.equal(body.resource, `${baseUrl}/mcp`);
    assert.deepEqual(body.authorization_servers, ["https://cms.invalid"]);
    assert.ok((body as { scopes_supported?: string[] }).scopes_supported?.includes("seo:write"));
  }
});

test("advertises HTTPS when deployed behind the trusted reverse proxy", async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig("https://cms.invalid"));
  t.after(() => closeServer(server));

  const metadata = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`, {
    headers: { "X-Forwarded-Proto": "https" },
  });
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json() as { resource: string }).resource, `${baseUrl.replace("http:", "https:")}/mcp`);

  const unauthorized = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
  });
  assert.match(
    unauthorized.headers.get("www-authenticate") ?? "",
    /^Bearer .*resource_metadata="https:\/\//,
  );
});

test("rejects browser origins that were not explicitly allowlisted", async (t) => {
  const { server, baseUrl } = await listenApp(baseConfig("https://cms.invalid"));
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers: {
      Authorization: "Bearer znx_test",
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });

  assert.equal(response.status, 403);
});

test("relays the request body and Bearer token to the upstream /api/mcp route", async (t) => {
  let forwardedAuthorization: string | undefined;
  let forwardedPath: string | undefined;
  let forwardedBody: string | undefined;
  let forwardedAccept: string | undefined;
  let forwardedProtocolVersion: string | undefined;
  const upstream = createServer((req, res) => {
    forwardedAuthorization = req.headers.authorization;
    forwardedAccept = req.headers.accept;
    forwardedProtocolVersion = req.headers["mcp-protocol-version"] as string | undefined;
    forwardedPath = req.url;
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      forwardedBody = Buffer.concat(chunks).toString("utf8");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
    });
  });
  const upstreamUrl = await listen(upstream);
  t.after(() => closeServer(upstream));

  const { server, baseUrl } = await listenApp(baseConfig(upstreamUrl));
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: "Bearer znx_workspace_key",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "Mcp-Protocol-Version": "2025-11-25",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    jsonrpc: "2.0",
    id: 1,
    result: { ok: true },
  });
  assert.equal(forwardedAuthorization, "Bearer znx_workspace_key");
  assert.equal(forwardedAccept, "application/json, text/event-stream");
  assert.equal(forwardedProtocolVersion, "2025-11-25");
  assert.equal(forwardedPath, "/api/mcp");
  assert.equal(
    forwardedBody,
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  );
});

test("rewrites an upstream 401 to point at this gateway's own resource metadata, not the CMS's", async (t) => {
  const upstream = createServer((_req, res) => {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "WWW-Authenticate",
      'Bearer realm="zenex", resource_metadata="https://cms.invalid/.well-known/oauth-protected-resource"',
    );
    res.end(JSON.stringify({ error: "invalid_token" }));
  });
  const upstreamUrl = await listen(upstream);
  t.after(() => closeServer(upstream));

  const { server, baseUrl } = await listenApp(baseConfig(upstreamUrl));
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { Authorization: "Bearer znx_at_expired", "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  assert.equal(response.status, 401);
  const challenge = response.headers.get("www-authenticate") ?? "";
  assert.match(challenge, new RegExp(`resource_metadata="${baseUrl}/\\.well-known/oauth-protected-resource/mcp"`));
  assert.ok(!challenge.includes("cms.invalid"));
});

test("returns 502 when the upstream is unreachable", async (t) => {
  const { server, baseUrl } = await listenApp(
    baseConfig("http://127.0.0.1:1"),
  );
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/`, {
    method: "POST",
    headers: {
      Authorization: "Bearer znx_test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });

  assert.equal(response.status, 502);
});

function baseConfig(cmsUrl: string): McpGatewayConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    cmsUrl,
    requestTimeoutMs: 1_000,
    allowedHosts: undefined,
    allowedOrigins: new Set(),
  };
}

async function listenApp(config: McpGatewayConfig) {
  const server = createProxyApp(config, silentLogger).listen(0, "127.0.0.1");
  const baseUrl = await listeningUrl(server);
  return { server, baseUrl };
}

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  return listeningUrl(server);
}

async function listeningUrl(server: Server): Promise<string> {
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an IPv4 server address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
