// Creates one global hourly sweep. Each plan item stores its own visible date,
// so one QStash schedule can service every blog without per-blog cron jobs.
// Usage: node --env-file=.env scripts/configure-growth-drafts.mjs
import { Client } from "@upstash/qstash";

const token = process.env.QSTASH_TOKEN;
const origin = process.env.QSTASH_API_URL || process.env.NEXTAUTH_URL;
if (!token || !origin?.startsWith("https://")) {
  console.error("QSTASH_TOKEN and an HTTPS QSTASH_API_URL (or NEXTAUTH_URL) are required.");
  process.exit(1);
}

const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined });
const { scheduleId } = await client.schedules.create({
  scheduleId: "zenex-growth-draft-generation",
  destination: `${origin.replace(/\/$/, "")}/api/qstash/growth-drafts`,
  cron: "15 * * * *",
  body: "{}",
  headers: { "Content-Type": "application/json" },
  retries: 2,
});
console.log(`QStash draft generation schedule ready: ${scheduleId}`);
