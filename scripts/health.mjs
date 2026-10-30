// Hourly health check, run by .github/workflows/feed-health.yml. Reads the live site's
// data/status.json and decides whether to alert: the workflow opens a GitHub issue
// (which emails the repo owner) when a problem has lasted, and closes it on recovery.
//
//   node scripts/health.mjs                 # check the live site
//   node scripts/health.mjs path/to/status.json
//
// Writes report.md and sets the step output healthy=true|false. Always exits 0 so a
// failed check never looks like a broken workflow; the issue is the alert.

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { dataHealth } from "../public/lib.js";

const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance-info.vercel.app").replace(/\/$/, "");

const when = (iso) => (iso ? `${iso.replace("T", " ").slice(0, 16)} UTC` : "never");

export function healthReport(status, now = Date.now()) {
  const { level, problems } = dataHealth(status, now);
  const alerts = problems.filter((p) => p.alert);
  const lines = [
    `**Status:** ${alerts.length ? "needs attention" : level === "ok" ? "all sources healthy" : "minor issues, no alert"}`,
    "",
    `- Last successful update: ${when(status?.updated)}`,
    `- Last rebuild: ${when(status?.checked)}`,
    status?.feeds ? `- Sources reachable: ${status.feeds.ok} of ${status.feeds.total}` : null,
    "",
  ];
  if (alerts.length) lines.push("### Needs attention", ...alerts.map((p) => `- ${p.text}`), "");
  const minor = problems.filter((p) => !p.alert);
  if (minor.length) lines.push("### Also seen (not alerting yet)", ...minor.map((p) => `- ${p.text}`), "");
  lines.push(`Details: ${SITE_URL}/status.html`, "", "This issue closes itself when the next check is healthy.");
  return { healthy: alerts.length === 0, body: lines.filter((l) => l !== null).join("\n") };
}

async function load(arg) {
  if (arg) return JSON.parse(await readFile(arg, "utf8"));
  try {
    const res = await fetch(`${SITE_URL}/data/status.json`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`could not read status.json: ${e.message}`);
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = await load(process.argv[2]);
  const { healthy, body } = healthReport(status);
  console.log(body);
  await writeFile("report.md", body + "\n");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `healthy=${healthy}\n`);
}
