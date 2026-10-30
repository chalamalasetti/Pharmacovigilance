// Writes the latest updates as an RSS feed, so PV teams can follow them in Outlook,
// Teams, Slack or any feed reader.

import { writeFile } from "node:fs/promises";
import { CATEGORIES } from "./classify.mjs";

const SITE = process.env.SITE_URL || "https://pharmacovigilance.vercel.app";
const LIMIT = 100;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rssXml(updates, agencies) {
  const countries = new Map(agencies.map((c) => [c.code, c.country]));
  const labels = new Map(CATEGORIES.map((c) => [c.id, c.label]));
  const items = updates.slice(0, LIMIT).map((u) => {
    const where = countries.get(u.country) ?? u.country;
    return `  <item>
    <title>${esc(`[${where}] ${u.title}`)}</title>
    <link>${esc(u.link)}</link>
    <guid isPermaLink="false">${u.id}</guid>
    ${u.published ? `<pubDate>${new Date(u.published).toUTCString()}</pubDate>` : ""}
    <category>${esc(labels.get(u.category) ?? u.category)}</category>
    <category>${esc(where)}</category>
    <description>${esc(`${u.source}${u.summary ? `: ${u.summary}` : ""}`)}</description>
  </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>PV Info: pharmacovigilance and regulatory updates</title>
  <link>${SITE}/</link>
  <description>Drug safety alerts, regulatory changes, guidelines and policy updates from regulators worldwide.</description>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items.join("\n")}
</channel>
</rss>
`;
}

export async function writeRss(updates, agencies, file) {
  await writeFile(file, rssXml(updates, agencies));
}
