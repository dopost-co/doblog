// Creates the shared hourly QStash sweep. Each blog stores its own next run and
// frequency, so this is one cheap global schedule rather than one cron per blog.
// Usage: node --env-file=.env scripts/configure-content-discovery.mjs
import { Client } from "@upstash/qstash";

const token = process.env.QSTASH_TOKEN;
const origin = process.env.QSTASH_API_URL || process.env.NEXTAUTH_URL;
if (!token || !origin?.startsWith("https://")) {
  console.error("QSTASH_TOKEN and an HTTPS QSTASH_API_URL (or NEXTAUTH_URL) are required.");
  process.exit(1);
}

const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
const { scheduleId } = await client.schedules.create({
  scheduleId: "zenex-content-opportunity-discovery",
  destination: `${origin.replace(/\/$/, "")}/api/qstash/content-discovery`,
  cron: "0 * * * *",
  body: "{}",
  headers: { "Content-Type": "application/json" },
  retries: 2,
});
console.log(`QStash content discovery schedule ready: ${scheduleId}`);
