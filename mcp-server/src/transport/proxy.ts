import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import type { McpGatewayConfig } from "../config.js";
import { logger as defaultLogger, type Logger } from "../observability/logger.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MCP_ENDPOINTS = ["/", "/mcp"];
const UPSTREAM_PATH = "/api/mcp";
// zenex-cms bounds MCP JSON bodies to 1 MiB (base64 image uploads included);
// express.json()'s 100kb default would truncate those before they reach the
// upstream check, so this gateway stays on a raw body relay instead.
const MAX_BODY_BYTES = "2mb";

export function createProxyApp(
  config: McpGatewayConfig,
  log: Logger = defaultLogger,
): Express {
  const app = express();
  app.disable("x-powered-by");

  if (config.allowedHosts?.length) {
    const allowedHosts = new Set(config.allowedHosts);
    app.use((req, res, next) => {
      const hostname = req.hostname;
      if (!hostname || !allowedHosts.has(hostname)) {
        res.status(421).json(jsonRpcError("Misdirected request"));
        return;
      }
      next();
    });
  }

  app.use((req, res, next) => {
    const inboundRequestId = req.header("x-request-id");
    const requestId =
      inboundRequestId && REQUEST_ID_PATTERN.test(inboundRequestId)
        ? inboundRequestId
        : randomUUID();
    const startedAt = performance.now();

    res.locals.requestId = requestId;
    res.setHeader("x-request-id", requestId);
    res.once("finish", () => {
      log.info("http_request", {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "zenex-mcp-gateway",
      transport: "streamable-http",
    });
  });

  app.all(
    MCP_ENDPOINTS,
    express.raw({ type: "application/json", limit: MAX_BODY_BYTES }),
    async (req, res) => {
      const origin = req.header("origin");
      if (origin && !config.allowedOrigins.has(origin)) {
        res.status(403).json(jsonRpcError("Origin is not allowed"));
        return;
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Expose-Headers", "x-request-id");
      }

      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, Mcp-Protocol-Version, x-request-id",
        );
        res.status(204).end();
        return;
      }

      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        res.status(405).json(jsonRpcError("Method not allowed"));
        return;
      }

      const authorization = req.header("authorization");
      if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
        res.setHeader("WWW-Authenticate", 'Bearer realm="zenex-mcp"');
        res
          .status(401)
          .json(jsonRpcError("Bearer authentication is required"));
        return;
      }

      const requestId = res.locals.requestId as string;
      const body = req.body;
      if (!Buffer.isBuffer(body)) {
        res
          .status(415)
          .json(jsonRpcError("Content-Type must be application/json"));
        return;
      }

      try {
        const upstream = await fetch(new URL(UPSTREAM_PATH, config.cmsUrl), {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: authorization,
            "x-request-id": requestId,
          },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(config.requestTimeoutMs),
        });

        const responseBody = await upstream.text();
        res.status(upstream.status);
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") ?? "application/json",
        );
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const wwwAuthenticate = upstream.headers.get("www-authenticate");
        if (wwwAuthenticate) res.setHeader("WWW-Authenticate", wwwAuthenticate);
        res.send(responseBody);
      } catch (error) {
        log.error("upstream_request_failed", {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(502).json(jsonRpcError("Upstream zenex-cms request failed"));
      }
    },
  );

  return app;
}

function jsonRpcError(message: string, code = -32000) {
  return {
    jsonrpc: "2.0" as const,
    error: { code, message },
    id: null,
  };
}
