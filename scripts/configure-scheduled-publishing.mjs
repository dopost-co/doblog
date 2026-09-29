// Creates (or updates) the QStash schedule that sweeps overdue scheduled posts.
// Per-post messages publish on time; this is the safety net if one is lost (runs every 15 minutes).
// Usage: node --env-file=.env scripts/configure-scheduled-publishing.mjs
import { Client } from "@upstash/qstash";

const token = process.env.QSTASH_TOKEN;
const origin = process.env.QSTASH_API_URL || process.env.NEXTAUTH_URL;
if (!token || !origin?.startsWith("https://")) {
  console.error("QSTASH_TOKEN and an HTTPS QSTASH_API_URL (or NEXTAUTH_URL) are required.");
  process.exit(1);
}

const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
const { scheduleId } = await client.schedules.create({
  scheduleId: "zenex-publish-scheduled-posts",
  destination: `${origin.replace(/\/$/, "")}/api/qstash/publish-scheduled`,
  cron: "*/15 * * * *",
  body: "{}",
  headers: { "Content-Type": "application/json" },
  retries: 3,
});
console.log(`QStash schedule ready: ${scheduleId}`);
