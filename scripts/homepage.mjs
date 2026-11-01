// Add a small, escaped public snapshot to the homepage at build time. No network requests.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  homepageData,
  excerpt,
  dateLabel,
  feedbackLink,
  coverageSummary,
  coverageLine,
} from "../public/home-lib.js";
import { matches } from "../public/lib.js";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function homepageSnapshot(html, raw, now = Date.now(), coverage = null) {
  const sources = coverageSummary(coverage);
  if (sources)
    html = html.replace(
      /(<p id="hero-sources"[^>]*>)[\s\S]*?(<\/p>)/,
      (_, before, after) => before + escapeHtml(coverageLine(sources)) + after,
    );
  const data = homepageData(raw),
    countries = new Map(data.countries.map((c) => [c.code, c.country])),
    categories = new Map(data.categories.map((c) => [c.id, c.label]));
  const updates = data.updates
    .filter((u) => matches(u, { days: "30", now }))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  const cards = updates
    .slice(0, 6)
    .map(
      (u) =>
        `<article class="card c-${escapeHtml(u.category)}" data-page-snapshot><div class="meta"><span class="tag">${escapeHtml(categories.get(u.category) ?? u.category)}</span><span class="where">${escapeHtml(countries.get(u.country) ?? u.country)}</span><span class="badge${u.kind === "official" ? "" : " badge-news"}">${u.kind === "official" ? "Regulator feed" : "News coverage"}</span></div><h3><a href="${escapeHtml(u.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(u.title)}</a></h3><p class="home-card-date">${u.published ? 'Published <time datetime="' + escapeHtml(u.published) + '">' + dateLabel(u.published) + "</time>" : "Publication date not supplied"}</p><p class="card-summary">${excerpt(u) ? "<b>Source excerpt</b>" + escapeHtml(excerpt(u)) : "This feed provides a headline only. Open the original publication for details."}</p><p class="home-card-source">Source: ${escapeHtml(u.source)}</p><div class="home-card-footer"><a href="${escapeHtml(u.link)}" target="_blank" rel="noopener noreferrer">${u.kind === "official" ? "Original notice" : "Original report"} ↗</a><a href="${escapeHtml(feedbackLink(u))}" target="_blank" rel="noopener noreferrer">Suggest a correction ↗</a></div></article>`,
    )
    .join("\n");
  const fragment =
    cards ||
    '<p class="empty">No recent updates are available in this page snapshot. <a href="coverage.html">Explore source coverage</a> or <a href="feed.xml">read RSS</a>.</p>';
  if (
    !/<!-- home-snapshot:start -->[\s\S]*?<!-- home-snapshot:end -->/.test(html)
  )
    throw Error("Homepage snapshot markers missing");
  return html.replace(
    /<!-- home-snapshot:start -->[\s\S]*?<!-- home-snapshot:end -->/,
    "<!-- home-snapshot:start -->\n" +
      fragment +
      "\n<!-- home-snapshot:end -->",
  );
}
export async function buildHomepage({ root = ROOT, now = Date.now() } = {}) {
  const file = path.join(root, "public/index.html"),
    [html, raw] = await Promise.all([
      readFile(file, "utf8"),
      readFile(path.join(root, "public/data/updates.json"), "utf8"),
    ]);
  const coverage = await readFile(
    path.join(root, "public/data/coverage.json"),
    "utf8",
  )
    .then(JSON.parse)
    .catch(() => null);
  await writeFile(file, homepageSnapshot(html, JSON.parse(raw), now, coverage));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  buildHomepage().then(() =>
    console.log(
      "homepage: recent public updates embedded; source diagnostics remain admin-only",
    ),
  );
