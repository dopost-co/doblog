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
  const upstream = createServer((req, res) => {
    forwardedAuthorization = req.headers.authorization;
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
  assert.equal(forwardedPath, "/api/mcp");
  assert.equal(
    forwardedBody,
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  );
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
