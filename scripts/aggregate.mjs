// Pulls every regulator feed and PV news search, keeps what matters to drug safety
// and regulatory teams, tags each update with a country and section, and writes
// public/data/updates.json (for the site) and public/feed.xml (for feed readers).
//
//   node scripts/aggregate.mjs                  # fetch live feeds
//   node scripts/aggregate.mjs --fixtures DIR   # parse DIR/manifest.json feeds from local .xml files (offline testing)

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { CATEGORIES, categorize, isRelevant, countryMatchers, detectCountry } from "./classify.mjs";
import { buildFeeds } from "./sources.mjs";
import { writeRss } from "./rss.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/updates.json");
const AGENCIES = path.join(ROOT, "public/data/agencies.json");
// Regulators publish far less often than newsrooms, so keep two months on the page.
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 1500;
const MAX_PER_FEED = 40;
const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 8;
export const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance.vercel.app").replace(/\/$/, "");
const UA = "PVInfo/0.1 (+https://github.com/chalamalasetti/Pharmacovigilance)";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text" });

export const updateId = (link) => createHash("sha1").update(link).digest("hex").slice(0, 10);

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (v == null ? "" : typeof v === "object" ? String(v["#text"] ?? "") : String(v));

async function fetchText(url, tries = 2) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return fetchText(url, tries - 1);
  }
}

// Same update, different tracking tags: strip them so duplicates collapse.
export function normalizeLink(link) {
  try {
    const u = new URL(link.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|at_|cmp|ito|ns_|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    }
    u.protocol = "https:";
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");
    return u.href.replace(/\/$/, "");
  } catch {
    return link.trim();
  }
}

// Loose key for spotting the same headline from two outlets.
export function titleKey(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function stripHtml(s) {
  return String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&(amp|quot|apos|#39|lt|gt|nbsp);/g, (m, e) => ({ amp: "&", quot: '"', apos: "'", "#39": "'", lt: "<", gt: ">", nbsp: " " })[e])
    .replace(/\s+/g, " ")
    .trim();
}

function linkFromItem(item) {
  for (const l of asArray(item.link)) {
    if (typeof l === "string" && l.trim()) return l.trim();
    if (l && l["@href"] && (!l["@rel"] || l["@rel"] === "alternate")) return l["@href"];
  }
  const guid = text(item.guid) || text(item.id);
  return guid.startsWith("http") ? guid : null;
}

// Reads RSS 2.0, RSS 1.0 (RDF) and Atom. News searches name the outlet in <source>
// and at the end of the headline ("Title - Outlet"); both are split back out.
export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const items = doc.rss?.channel
    ? asArray(doc.rss.channel.item)
    : doc["rdf:RDF"]
      ? asArray(doc["rdf:RDF"].item)
      : asArray(doc.feed?.entry);

  return items
    .map((item) => {
      const raw = linkFromItem(item);
      if (!raw) return null;
      let title = stripHtml(text(item.title));
      const outlet = text(item.source).trim();
      if (outlet && title.endsWith(` - ${outlet}`)) title = title.slice(0, -(outlet.length + 3)).trim();
      let summary = stripHtml(text(item.description) || text(item.summary) || text(item.content)).slice(0, 500);
      // News search descriptions just repeat the headline and outlet.
      if (summary && (summary.startsWith(title) || (outlet && summary.endsWith(outlet) && summary.length < title.length + outlet.length + 10))) summary = "";
      const date = new Date(text(item.pubDate) || text(item["dc:date"]) || text(item.published) || text(item.updated));
      if (date.getTime() > Date.now()) date.setTime(Date.now());
      return {
        title,
        link: normalizeLink(raw),
        summary,
        source: outlet || feed.source,
        published: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      };
    })
    .filter((i) => i && i.title);
}

const CATEGORY_WEIGHT = { safety: 5, recall: 4, label: 4, regulation: 4, guideline: 4, policy: 2, inspection: 2, approval: 1, news: 0 };

// Tags each raw item with its country, region, agency and section, and a priority score
// used to pick the "Key updates" at the top of the page.
export function enrich(item, feed, { matchers, byCode }) {
  const found = detectCountry(`${item.title}. ${item.summary}`, matchers);
  if (feed.relevance === "pv" && !isRelevant(item.title, item.summary, { namesRegulator: Boolean(found?.agency) })) return null;
  // Official feeds speak for their own country; news is placed by what it mentions.
  const code = feed.kind === "official" ? feed.country : (found?.code ?? feed.country ?? "INT");
  const place = byCode.get(code) ?? byCode.get("INT");
  const agency = feed.kind === "official" ? place.agencies[0].abbr : found?.code === code ? found.agency : null;
  const { category, tags } = categorize(item.title, item.summary, feed.category);
  const priority = CATEGORY_WEIGHT[category] + (feed.kind === "official" ? 3 : 0) + (agency ? 1 : 0);
  return {
    id: updateId(item.link),
    title: item.title,
    link: item.link,
    ...(item.summary && { summary: item.summary }),
    source: item.source,
    kind: feed.kind,
    country: place.code,
    region: place.region,
    ...(agency && { agency }),
    category,
    tags,
    priority,
    published: item.published,
  };
}

// Newest first, one copy of each update (by link or headline). Official notices win
// over news coverage of the same headline because they sort first on ties.
export function pickUpdates(all, { checkAge = true, now = Date.now() } = {}) {
  const seen = new Set();
  return all
    .filter((u) => (checkAge && u.published ? now - Date.parse(u.published) < MAX_AGE_MS : true))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "") || (b.kind === "official") - (a.kind === "official"))
    .filter((u) => {
      const keys = [`l:${u.link}`, `t:${titleKey(u.title)}`];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    })
    .slice(0, MAX_ITEMS);
}

// The last snapshot: the local file when running on a computer, or the live site's copy
// when building on Vercel (where each build starts without the previous output).
async function previousUpdates(out) {
  try {
    return JSON.parse(await readFile(out, "utf8")).updates ?? [];
  } catch {}
  if (process.env.SKIP_PREVIOUS) return [];
  try {
    return JSON.parse(await fetchText(`${SITE_URL}/data/updates.json`, 1)).updates ?? [];
  } catch {
    return [];
  }
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await fn(list[i]) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}

export function summarize(updates, agencies) {
  const count = (key) => updates.reduce((m, u) => m.set(u[key], (m.get(u[key]) ?? 0) + 1), new Map());
  const byCountry = count("country");
  const tagCount = new Map();
  for (const u of updates) for (const t of u.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  return {
    categories: CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: tagCount.get(c.id) ?? 0 })),
    countries: agencies.map((c) => ({ code: c.code, country: c.country, region: c.region, count: byCountry.get(c.code) ?? 0 })),
  };
}

// Collects updates and writes updates.json and feed.xml. Returns how many were written.
export async function aggregate({ fixturesDir = null, out = OUT } = {}) {
  const agencies = JSON.parse(await readFile(AGENCIES, "utf8"));
  const ctx = { matchers: countryMatchers(agencies), byCode: new Map(agencies.map((c) => [c.code, c])) };
  const feeds = fixturesDir
    ? JSON.parse(await readFile(path.join(fixturesDir, "manifest.json"), "utf8"))
    : buildFeeds(JSON.parse(await readFile(path.join(ROOT, "sources.json"), "utf8")), agencies);

  const load = async (feed) => {
    const xml = fixturesDir ? await readFile(path.join(fixturesDir, feed.fixture), "utf8") : await fetchText(feed.url);
    const items = parseFeed(xml, feed);
    const kept = items.map((i) => enrich(i, feed, ctx)).filter(Boolean).slice(0, MAX_PER_FEED);
    kept.seen = items.length;
    return kept;
  };

  const results = await mapLimit(feeds, CONCURRENCY, load);
  const fresh = [];
  const status = { ok: 0, failed: [] };
  results.forEach((r, i) => {
    const f = feeds[i];
    const label = `${f.source}${f.kind === "news" && f.country ? ` (${f.country})` : ""}`;
    if (r.status === "fulfilled") {
      status.ok++;
      console.log(`${r.value.length ? "ok   " : "EMPTY"} ${label}: kept ${r.value.length} of ${r.value.seen}`);
      fresh.push(...r.value);
    } else {
      status.failed.push(f.source);
      console.warn(`FAIL ${label}: ${r.reason?.message ?? r.reason}`);
    }
  });

  if (!fresh.length && !fixturesDir) {
    // Don't wipe the last good snapshot if every feed failed.
    throw new Error("No updates collected; leaving existing updates.json untouched.");
  }

  // Keep earlier updates still inside the window, so a feed that's down today doesn't erase its history.
  const previous = fixturesDir ? [] : await previousUpdates(out);
  const updates = pickUpdates([...fresh, ...previous], { checkAge: !fixturesDir });
  const data = {
    updated: new Date().toISOString(),
    feeds: { total: feeds.length, ok: status.ok, failed: status.failed.length },
    ...summarize(updates, agencies),
    updates,
  };
  await writeFile(out, JSON.stringify(data) + "\n");
  await writeRss(updates, agencies, path.join(path.dirname(out), "..", "feed.xml"));
  const official = updates.filter((u) => u.kind === "official").length;
  const countries = new Set(updates.map((u) => u.country)).size;
  console.log(`wrote ${updates.length} updates (${official} official, ${countries} countries) to ${path.relative(ROOT, out)}`);
  return updates.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--fixtures");
  const fixturesDir = i > -1 ? path.resolve(process.argv[i + 1]) : null;
  aggregate({ fixturesDir }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
