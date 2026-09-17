# zenex-mcp-gateway

Standalone remote MCP gateway for zenex-cms, deployable as its own service
(its own container, its own subdomain) independently of the main CMS. It
holds no business logic and no database access: every request is relayed
as-is, with its `Authorization: Bearer <key>` header, to the CMS's existing
`POST /api/mcp` Streamable HTTP endpoint (see [`../lib/integrations/mcp.ts`](../lib/integrations/mcp.ts)
and [`../app/api/mcp/route.ts`](../app/api/mcp/route.ts)). Tools, scopes and
permissions are entirely defined by the CMS; this gateway only adds a
deployment and network boundary in front of it.

## Why a separate service

The CMS's own `/api/mcp` route intentionally rejects any browser `Origin`
header (private API keys should stay in server-side clients). That is the
right default for the CMS itself, but it blocks browser-based MCP clients
(e.g. a remote connector in Claude.ai or ChatGPT) from ever working. This
gateway enforces its own explicit origin allowlist (`MCP_ALLOWED_ORIGINS`)
instead, so those origins can be allowed for MCP without loosening the CMS's
own API. It also gives the MCP endpoint a dedicated hostname and lifecycle,
so it can be redeployed, scaled or rate-limited independently of the CMS.

## Development

```bash
npm install
ZENEX_CMS_URL=https://your-cms.example npm run dev
```

`GET /health` is public. `POST /` and `POST /mcp` require
`Authorization: Bearer <key>` and are relayed to `${ZENEX_CMS_URL}/api/mcp`.
GET/DELETE on the MCP endpoints return 405, matching the CMS route (stateless
JSON only, no SSE stream or persistent sessions).

## Configuration

| Variable                 | Default | Description                                                        |
| ------------------------- | ------- | -------------------------------------------------------------------- |
| `HOST`                    | `0.0.0.0` | HTTP interface                                                      |
| `PORT`                    | `3200`  | HTTP port                                                           |
| `ZENEX_CMS_URL`           | —       | **Required.** Origin of the deployed CMS, e.g. `https://cms.example` |
| `MCP_REQUEST_TIMEOUT_MS`  | `30000` | Timeout for the upstream call to the CMS                            |
| `MCP_ALLOWED_HOSTS`       | empty   | Comma-separated `Host` header allowlist; set in production          |
| `MCP_ALLOWED_ORIGINS`     | empty   | Comma-separated browser `Origin` allowlist, e.g. `https://claude.ai` |

`ZENEX_CMS_URL` must be `https://` except on `localhost`/`127.0.0.1`.
Requests without an `Origin` header (native/server clients) are always
allowed; any `Origin` present is rejected unless it is in
`MCP_ALLOWED_ORIGINS`.

## OAuth (ChatGPT, Claude connectors)

This gateway never issues or validates OAuth tokens itself — the CMS is the
authorization server (login, consent, token issuance all happen there, see
the main [README](../README.md#oauth-for-chatgpt-claude-and-other-connector-style-clients)).
The gateway's only job is to tell clients where to find it:

- `GET /.well-known/oauth-protected-resource` and `/mcp` — declare this
  gateway's own public URL as the resource and `ZENEX_CMS_URL` as the
  `authorization_servers` entry.
- On a 401 (missing or invalid bearer), `WWW-Authenticate` points back at
  this gateway's own metadata URL, never the CMS's internal one, even when
  the 401 originated upstream.

For an issued OAuth access token to work through this gateway, the CMS must
accept this gateway's public URL as a valid token `resource`. Set on the CMS:

```
MCP_OAUTH_EXTRA_RESOURCES=https://mcp.your-cms.example/mcp
```

(matching whatever public domain you attach to this gateway below).

## Deploying to Dokploy

This package lives in `mcp-server/` inside the main `zenex-cms` repo but
deploys as its own Dokploy application, separate from the CMS app:

1. Create a new Dokploy application from this same Git repository.
2. Build type: **Dockerfile**, build context `.` (repo root), Dockerfile
   path `mcp-server/Dockerfile`.
3. Set the environment variables above (`ZENEX_CMS_URL` at minimum).
4. Point the container port to `3200` and attach a dedicated domain, e.g.
   `mcp.your-cms.example`.

See [`dokploy.yaml`](dokploy.yaml) for the exact values (reference only —
Dokploy is configured through its UI, not by reading that file).

## Testing

```bash
npm test
```
