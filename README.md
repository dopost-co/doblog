# Zenex CMS

A multilingual headless CMS built with Next.js 16, React 19, Prisma 6, PostgreSQL and Editor.js. Inspired by [Zenblog](https://www.zenblog.com/); this is an independent codebase.

## Features

- Multiple blogs, owner/member collaboration, authors, categories and tags.
- Editor.js content, drafts/publication, SEO fields and linked translations.
- Optional OpenAI-powered translation and S3-compatible Cloudflare R2 image storage.
- Public published-content API and a separate private management API.
- MCP via Streamable HTTP and a local stdio bridge, sharing the private API’s operations and permissions.
- Owner-managed, expiring and revocable API keys; secrets displayed once and stored only as hashes.
- Per-blog DataForSEO research with reusable encrypted account credentials, response caching and hard spend limits.
- An Autopilot workspace that continuously discovers content gaps from the site's sitemap, existing posts, configured competitors and optional DataForSEO metrics, then writes on schedule.
- Weekly opportunity scans keep a dated editorial queue full. Owners choose ideas only or 1–7 automatic articles per week, then choose review-first or automatic publication. Generated articles include structured SEO targets, internal links and optional generated images.

## Local setup

Use **Node.js 24.x** (see .nvmrc) and PostgreSQL.

```bash
npm ci
cp .env.example .env
# Configure DATABASE_URL, NEXTAUTH_URL and NEXTAUTH_SECRET in .env.
npx prisma generate
npx prisma migrate dev
npm run dev
```

Open [localhost:4444](http://localhost:4444). Register or sign in, create a blog, then use its navigation: Posts, Authors, Categories, Autopilot, Settings, MCP and API keys.

Generate an authentication secret with `openssl rand -base64 32`. Do not commit .env files. GitHub OAuth is optional; configure its client credentials and callback URL at `https://your-cms.example/api/auth/callback/github`. Set the canonical authentication URL and trusted proxy/host settings correctly for your deployment. See [.env.example](.env.example) for the exact environment names used by the code.

Optional integrations:

- AI translation: `OPENAI_API_KEY`.
- AI article drafts: the same OpenAI access used for translation; optionally override `OPENAI_CONTENT_MODEL` and `OPENAI_IMAGE_MODEL`.
- Image storage: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. Use a bucket-scoped storage token and a public media origin separate from the CMS. The configured public media URL serves uploaded images without authentication, including images used in drafts.
- SEO provider credentials: `INTEGRATION_ENCRYPTION_KEY` must be one stable base64-encoded 32-byte key (`openssl rand -base64 32`). Losing or rotating it without re-encrypting rows makes saved provider connections unreadable. `MCP_FILE_DOWNLOAD_HOSTS` restricts MCP file ingestion to trusted delivery hosts.
- Autopilot automation: configure QStash, deploy the public callbacks, then run `npm run qstash:configure-content-discovery` and `npm run qstash:configure-growth-drafts` once. The shared hourly sweeps refresh due plans and write due articles; Autopilot either leaves each one as a draft or publishes it immediately according to the owner's explicit setting.

## APIs: public delivery versus private editing

The **Blog ID in Settings is a public UUID, not an API key**.

Public, unauthenticated delivery:

```text
GET /api/blogs/{blogId}/posts
GET /api/blogs/{blogId}/posts/{slug}?language=en
GET /api/blogs/{blogId}/categories
GET /api/blogs/{blogId}/tags
```

Public posts are always published-only. Asking for `status=draft` or `status=all` returns 400. Post lists accept page, limit (1–100), language, category/tag IDs, orderBy, order and includeContent. Use `includeContent=false` for lightweight lists; paginate until totalPages when loading a complete archive. Public responses include sanitized HTML when content is included. Categories and tags are public metadata even when not used in published posts.

Private editorial API:

```text
Base: /api/v1/blogs/{blogId}
Authorization: Bearer <key>
Content-Type: application/json

GET, PATCH                  (base path)
GET, POST                   /posts, /categories, /tags, /authors
GET, PATCH, DELETE          /posts/{id}, /categories/{id}, /tags/{id}, /authors/{id}
POST                       /media
GET /api/v1/openapi         (public schema; no credentials required)
```

Private item paths use **record IDs**, not slugs. Lists are paginated; private posts include drafts. JSON bodies are bounded to 1 MiB. Images use base64, with a decoded limit of 700 KiB (JPEG/PNG/GIF/WebP). The existing dashboard multipart upload retains its 10 MiB image limit and checks blog access.

Create keys in **Blog → API keys** (owner only). The default selection is `content:read` + `content:write` for drafting. Additional scopes: `content:publish`, `content:delete`, `blog:write`, `media:write`.

Publication and editing already-published posts require write + publish. Deleting published posts requires delete + publish. Taxonomy/author edits can affect public posts, so content:write is for trusted editors. Keys cannot manage accounts, create/delete blogs, change members/owners, mint keys or invoke paid automatic translation. Agents can write their own translations using linked posts.

See the running app’s **/docs/api/management** for fields, examples, errors and limits, **/docs/mcp** for client setup, and **/api/v1/openapi** for the generated OpenAPI 3.1 contract.

## Connect an MCP client

Remote endpoint: `https://your-cms.example/api/mcp`, transport **Streamable HTTP**, header `Authorization: Bearer <key>`.

To expose MCP on its own subdomain, deployed independently of the CMS (e.g. for browser-based connectors), see [`mcp-server/`](mcp-server/README.md): a standalone gateway that relays requests to this same endpoint.

### OAuth (for ChatGPT, Claude and other connector-style clients)

Clients that connect through an OAuth flow rather than a pasted API key (ChatGPT's and Claude's "connector"/"remote MCP" UIs) can authorize directly: point them at the remote endpoint above (or the `mcp-server/` gateway's URL) and they discover everything else automatically —

- `GET /.well-known/oauth-protected-resource` (and `/mcp` variant) — RFC 9728, names this app as the authorization server.
- `GET /.well-known/oauth-authorization-server` — RFC 8414, lists the authorize/token/registration/revocation endpoints.
- `POST /api/oauth/register` — RFC 7591 dynamic client registration (public clients only, PKCE required, no client secret).
- `GET /oauth/authorize` — sign in, pick which blog to grant access to, and approve or deny the requested scopes.
- `POST /api/oauth/token` — authorization_code and refresh_token grants (refresh tokens rotate on every use; reusing an already-rotated one revokes the whole grant).
- `POST /api/oauth/revoke`.

Each authorization is scoped to the one or more blogs selected on the consent screen and to the scopes the client requested (defaulting to all of `content:read`, `content:write`, `content:publish`, `content:delete`, `blog:write`, `media:write` when it asks for none in particular). Multi-blog MCP connections expose `list_blogs`; every content tool then requires the public `blogId` returned by that tool. Losing access to any selected blog invalidates the token on its next use. Disconnecting the client from its own settings calls the revoke endpoint above.

When an owner configures **Autopilot** for a blog, clients with content read access also receive focused tools for settings/usage, keyword opportunities, search intent and a depth-10 SERP brief. Paid calls are cached, deduplicated by normalized payload and gated by per-run, daily and monthly budgets. Provider credentials remain server-side. Clients with `media:write` also receive `upload_image_file`, which accepts ChatGPT MCP file parameters and stores validated generated images in R2.

Autopilot keeps a persistent, dated editorial queue. It detects the sitemap, compares existing CMS posts and up to two competitor sitemaps, enriches candidate gaps with DataForSEO when enabled, and records why each idea was suggested. Owners choose a pace of 1, 2, 3, 5 or 7 automatic articles per week; Zenex continually replenishes the queue and owners can still add an idea manually or write an item early. They also explicitly choose whether completed articles wait for review or publish automatically. MCP exposes the same flow through `growth_configure_discovery`, `growth_discover_topics`, `growth_list_plan`, `growth_add_topic`, `growth_remove_topic` and `growth_generate_draft`, plus `growth_regenerate_cover` and `growth_refresh_covers` to redraw covers (each article's translations share one cover); MCP auto-publication additionally requires `content:publish`. Run records preserve stages, warnings and errors.

For a local stdio client, install this checkout’s dependencies, then configure:

```json
{
  "mcpServers": {
    "zenex": {
      "command": "node",
      "args": ["/absolute/path/to/zenex-cms/scripts/mcp-stdio.mjs"],
      "env": {
        "ZENEX_CMS_URL": "https://your-cms.example",
        "ZENEX_API_KEY": "znx_REPLACE_WITH_YOUR_KEY"
      }
    }
  }
}
```

This is a generic mcpServers JSON example; use your client’s equivalent command/args/env fields if its format differs. Use its secret store when supported. The local bridge needs no database connection or CMS .env file. It only forwards tool discovery and calls to the authenticated remote server. Run the script directly with node so package-manager banners do not corrupt stdout.

Compatibility: stdio and stateless Streamable HTTP JSON, both stateless (**no legacy SSE**). API keys and OAuth access tokens are both accepted as the Bearer credential on the same endpoint. HTTPS is mandatory for the stdio bridge except localhost. Redirects are rejected to prevent credential forwarding.

## Security and operations

- API keys contain 256 random bits, are stored as SHA-256 hashes, and expire in 1–365 days (90 by default), unless the owner enables Never expires. Up to 25 active keys per blog.
- Only owners can list/create/revoke keys; members cannot escalate their permissions through key management. No key has account-wide access.
- Revocation/expiry are checked on every HTTP request. Already-authorized in-flight work may finish.
- A PostgreSQL atomic counter enforces 120 authenticated HTTP requests/minute/key across all instances and both transports. 429 includes Retry-After: 60.
- Add IP-based rate limiting, request timeouts and request-size limits at your reverse proxy for unauthenticated traffic. The application key limiter is not a substitute for DDoS protection.
- Private API/MCP responses are no-store; browser cross-origin requests are rejected. Use server-side clients, never browser bundles, URLs, prompts, logs or public environment variables for secrets.
- REST and MCP validate schemas and blog ownership of linked records. Post relation replacements and publication checks use transactions/row locks.
- Status published makes content public immediately. Status scheduled with a future publishedAt publishes the post automatically at that instant (QStash callback plus a periodic sweep; see `.env.example`). Agents should default to drafts and obtain approval before publishing, scheduling or deleting.
- Uploaded media is public, validated by file signature and stored under server-generated names. MCP file downloads require HTTPS, an allowlisted OpenAI/ChatGPT delivery host, public DNS addresses, no redirects and a 10 MiB streaming limit. Signatures are not a full malware scan. Deleting a post does not delete image objects.
- After ambiguous write failures, check for saved content before retrying; POST does not provide idempotency keys.
- Public renderers sanitize HTML. Still treat editorial content as untrusted, including instructions embedded in text received by an agent.

### Deploying the API-key migration

Back up the database, review the migration, and apply it **before starting the new application**:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm start
```

The initial API key migration is `prisma/migrations/20260831010000_add_api_keys/migration.sql`. It adds ApiKey and does not modify existing content. For Docker/Dokploy, the container applies pending migrations on startup (`scripts/docker-entrypoint.mjs` runs `prisma migrate deploy` before `server.js`). It holds a PostgreSQL advisory lock, so replicas starting together are safe, and a failed migration stops the new release from starting. Migrations use MIGRATION_DATABASE_URL or DIRECT_URL when set; otherwise a Neon `-pooler` host or a Supabase transaction pooler (port 6543) is switched to its direct/session connection automatically. Set SKIP_MIGRATIONS=true to disable this. Do not use migrate dev or db push in production.

The `20260831130000_add_api_key_never_expires` migration adds `neverExpires` and makes `expiresAt` optional. Existing keys issued for 365 days (within one minute of clock/transaction skew) become non-expiring without changing their tokens, permissions or revocation state. Their original expiry timestamp is retained for compatibility while the old release is still running; the new release ignores it when `neverExpires` is true. Apply this migration before deploying the new application. Newly created non-expiring keys store a null expiry.

After deployment: sign in as owner, create a least-privilege key, verify list/create/update draft/category, confirm publication is denied without publish scope, test MCP initialize/list/call and stdio, revoke the key and confirm 401. Check another blog’s access is denied and public GET never returns the draft.

Rollback: previous app versions ignore ApiKey, so the additive table can remain. Do not drop it as a routine rollback; doing so irreversibly loses key metadata.

## Development and architecture

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

- `lib/integrations/`: scopes, schemas, operation catalog, key authentication, HTTP guardrails, MCP adapter and OpenAPI.
- `src/server/services/content/`: shared editorial business logic, dashboard adapter and cache invalidation.
- `src/server/services/api-keys/`: owner-only session-authenticated key management.
- `src/server/services/media/`: shared image validation/storage.
- `src/server/services/seo/`: DataForSEO client, normalization, caching, budget reservations and dashboard actions.
- `app/api/v1/`, `app/api/mcp/`: thin REST and MCP HTTP transports.
- `scripts/mcp-stdio.mjs`: standalone local-to-remote MCP bridge.
- `components/Integrations/`: dashboard settings and reusable MCP documentation.
- `app/docs/`: in-app public and private API guides.
- `tests/`: automated regression/security tests.

REST endpoint routing, MCP tool registration and the OpenAPI document use one operation catalog. The dashboard’s core post/category/author mutations call the same service. Existing bulk import and paid translation workflows remain session-only.

## References and support

- [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Official TypeScript MCP SDK](https://ts.sdk.modelcontextprotocol.io/)
- [Cloudflare R2 with AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [GitHub issues](https://github.com/raulcanodev/zenex-cms/issues)

See [MAINTENANCE.md](MAINTENANCE.md) for verification and deployment notes.
