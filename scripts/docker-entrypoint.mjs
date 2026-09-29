// Container entrypoint: applies pending Prisma migrations, then starts Next.js.
// `prisma migrate deploy` only applies committed migrations and holds a
// PostgreSQL advisory lock, so replicas starting together are safe. If a
// migration fails the process exits and the new release never serves traffic.
import { spawnSync } from "node:child_process";
import path from "node:path";

const PRISMA_CLI = "/opt/prisma/node_modules/prisma/build/index.js";

/**
 * Migrations need a direct or session-level connection: transaction poolers
 * (PgBouncer/Supavisor) break the advisory lock Prisma Migrate uses. Prefer
 * MIGRATION_DATABASE_URL or DIRECT_URL; otherwise derive it from DATABASE_URL:
 * - Neon: drop `-pooler` from the host to use the direct endpoint.
 * - Supabase: switch the pooler from transaction (6543) to session mode (5432).
 */
export function migrationDatabaseUrl(env = process.env) {
  const explicit = env.MIGRATION_DATABASE_URL || env.DIRECT_URL;
  if (explicit) return explicit;
  if (!env.DATABASE_URL) return undefined;
  const url = new URL(env.DATABASE_URL);
  if (url.hostname.endsWith(".neon.tech") && url.hostname.includes("-pooler.")) {
    url.hostname = url.hostname.replace("-pooler.", ".");
  } else if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.port = "5432";
  }
  url.searchParams.delete("pgbouncer");
  return url.toString();
}

if (process.env.SKIP_MIGRATIONS === "true") {
  console.log("[entrypoint] SKIP_MIGRATIONS=true, not running migrations");
} else {
  const databaseUrl = migrationDatabaseUrl();
  if (!databaseUrl) {
    console.error("[entrypoint] DATABASE_URL is not set");
    process.exit(1);
  }
  console.log("[entrypoint] Applying database migrations");
  const result = spawnSync(process.execPath, [PRISMA_CLI, "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl, CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
  if (result.status !== 0) {
    console.error(`[entrypoint] Migrations failed (exit ${result.status ?? result.signal}); not starting the app`);
    process.exit(result.status || 1);
  }
}

await import(path.resolve("server.js"));
