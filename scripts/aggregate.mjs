// Pulls every regulator feed and PV news search, keeps what matters to drug safety
// and regulatory teams, tags each update with a country and section, and writes
// public/data/updates.json (for the site) and public/feed.xml (for feed readers).
//
//   node scripts/aggregate.mjs                  # fetch live feeds
//   node scripts/aggregate.mjs --fixtures DIR   # parse DIR/manifest.json feeds from local .xml files (offline testing)

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATEGORIES, countryMatchers } from "./classify.mjs";
import { updateId, normalizeLink, titleKey, stripHtml, parseFeed, parseItems, enrich } from "./parse.mjs";
import { loadRegistry, buildFeeds, writeRegistryFiles, recordRuns } from "./sources.mjs";
import { safeFetch, explainError } from "./safe-fetch.mjs";
import { fillSecrets, redact } from "../public/sources-lib.js";
import { writeRss } from "./rss.mjs";
import { archiveUpdates, writePublicConfig } from "./cloud.mjs";
import { collectResearch } from "./research.mjs";
import { loadCompanies, annotateUpdates, writeCompanyData } from "./companies.mjs";
import { loadOverlay, siteSettings } from "./admin.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/updates.json");
const STATUS = "status.json";
const AGENCIES = path.join(ROOT, "public/data/agencies.json");
// Regulators publish far less often than newsrooms, so keep two months on the page.
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 1500;
const MAX_PER_FEED = 40;
const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 8;
export const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance-info.vercel.app").replace(/\/$/, "");
const UA = "PVInfo/0.1 (+https://github.com/chalamalasetti/Pharmacovigilance)";

export { updateId, normalizeLink, titleKey, stripHtml, parseFeed, enrich };

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

// When PV Info first saw each update (the evidence line on its impact card). An update
// already in the last snapshot keeps its original date.
export function stampRetrieved(fresh, previous, now = new Date().toISOString()) {
  const first = new Map(previous.filter((u) => u.retrieved).map((u) => [u.id, u.retrieved]));
  for (const u of fresh) u.retrieved = first.get(u.id) ?? now;
  return fresh;
}

// The last snapshot of a data file: the local copy when running on a computer, or the
// live site's copy when building on Vercel (where each build starts without the previous output).
async function previousJson(file, sitePath = path.basename(file)) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {}
  if (process.env.SKIP_PREVIOUS) return null;
  try {
    return JSON.parse(await fetchText(`${SITE_URL}/data/${sitePath}`, 1));
  } catch {
    return null;
  }
}

// One row per feed for the Data status page and the health check. lastSuccess,
// failingSince and the count of failures in a row carry over from the previous build,
// so an outage shows how long it has lasted. Registry sources keep their id when their
// address changes; rows from before the registry (keyed by address) are picked up once.
export function feedStatus(feeds, results, previous = [], now = new Date().toISOString()) {
  const before = new Map(previous.map((s) => [s.id, s]));
  return feeds.map((f, i) => {
    const legacy = updateId(f.url ?? f.fixture ?? f.source);
    const id = f.id ?? legacy;
    const prev = before.get(id) ?? before.get(legacy);
    const r = results[i];
    const row = { id, name: f.label ?? (f.id ? f.source : `${f.source}${f.kind === "news" && f.country ? ` (${f.country})` : ""}`), kind: f.kind, country: f.country ?? null };
    if (r.status === "fulfilled") return { ...row, ok: true, count: r.value.length, lastSuccess: now };
    return {
      ...row,
      ok: false,
      count: 0,
      error: String(r.reason?.message ?? r.reason).slice(0, 120),
      lastSuccess: prev?.lastSuccess ?? null,
      failingSince: (prev && !prev.ok && prev.failingSince) || now,
      failures: (prev && !prev.ok ? (prev.failures ?? 1) : 0) + 1,
    };
  });
}

// The small file behind the status strip on every page and the hourly health check.
export function buildStatus({ checked, updated, sources, research, registry = null }) {
  const ok = sources.filter((s) => s.ok).length;
  return {
    checked,
    updated,
    feeds: { total: sources.length, ok, failed: sources.length - ok },
    sources,
    research: research
      ? {
          refreshed: research.refreshed ?? null,
          sources: (research.sources ?? []).map(({ id, name, configured, ok, lastSuccess, error }) => ({ id, name, configured, ok, lastSuccess, ...(error && { error }) })),
        }
      : null,
    companies: registry
      ? {
          built: registry.built,
          sources: (registry.sources ?? []).map(({ id, name, ok, lastSuccess, error, stale, records, mapped }) => ({ id, name, ok, lastSuccess, records, mapped, ...(error && { error }), ...(stale && { stale }) })),
        }
      : null,
  };
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

// One collection run for data_source_runs (supabase/schema.sql).
export function sourceRun(feed, r, now) {
  const m = r.status === "fulfilled" ? r.value.meta ?? {} : r.reason ?? {};
  return {
    source_id: feed.id,
    run_at: now,
    ok: r.status === "fulfilled",
    http_status: m.http ?? null,
    format: m.format ?? null,
    error: r.status === "fulfilled" ? null : String(r.reason?.message ?? r.reason).slice(0, 300),
    items_seen: r.status === "fulfilled" ? r.value.seen : 0,
    items_kept: r.status === "fulfilled" ? r.value.length : 0,
    items_new: r.status === "fulfilled" ? (m.new ?? 0) : 0,
    newest_item: m.newest ?? null,
    attempts: m.attempts ?? 1,
    duration_ms: m.ms ?? null,
  };
}

// Collects updates and writes updates.json and feed.xml. Returns how many were written.
export async function aggregate({ fixturesDir = null, out = OUT } = {}) {
  const agencies = JSON.parse(await readFile(AGENCIES, "utf8"));
  const ctx = { matchers: countryMatchers(agencies), byCode: new Map(agencies.map((c) => [c.code, c])) };
  const dataDir = path.dirname(out);
  // The data source registry (Admin → Data sources) is the list of what to collect.
  const registry = fixturesDir
    ? null
    : await loadRegistry({ previous: () => previousJson(path.join(dataDir, "sources/registry.json"), "sources/registry.json") });
  let feeds;
  let problems = [];
  if (fixturesDir) feeds = JSON.parse(await readFile(path.join(fixturesDir, "manifest.json"), "utf8"));
  else {
    ({ feeds, problems } = buildFeeds(registry));
    console.log(`sources: ${feeds.length} active of ${registry.sources.length} in the registry (${registry.from})`);
    for (const p of problems) console.warn(`sources: skipped ${p.id}: ${p.problem}`);
  }
  const prevData = fixturesDir ? null : await previousJson(out);
  const known = new Set((prevData?.updates ?? []).map((u) => u.id));

  const load = async (feed) => {
    const started = Date.now();
    let body;
    let meta = { attempts: 1 };
    const secrets = registry?.secrets?.get(feed.id) ?? {};
    if (fixturesDir) body = await readFile(path.join(fixturesDir, feed.fixture), "utf8");
    else {
      const url = fillSecrets(feed.url, secrets);
      const headers = Object.fromEntries(Object.entries(feed.headers ?? {}).map(([k, v]) => [k, fillSecrets(v, secrets).value]));
      if (url.missing.length) throw Object.assign(new Error(`Missing credential ${url.missing.join(", ")}`), { attempts: 0 });
      try {
        const res = await safeFetch(url.value, { headers, timeoutMs: FETCH_TIMEOUT_MS });
        body = res.body;
        meta = { attempts: res.attempts, http: res.status, contentType: res.contentType, url: res.url };
      } catch (e) {
        throw Object.assign(new Error(redact(explainError(e), secrets)), { attempts: e.attempts, http: e.status, ms: Date.now() - started });
      }
    }
    const { format, items } = fixturesDir ? { format: "rss", items: parseFeed(body, feed) } : parseItems(body, feed, meta);
    // After a resume or a new address, only items inside the catch-up window are taken.
    const since = feed.since ? Date.parse(feed.since) : null;
    const fresh = since ? items.filter((i) => !i.published || Date.parse(i.published) >= since) : items;
    const kept = fresh.map((i) => enrich(i, feed, ctx)).filter(Boolean).slice(0, MAX_PER_FEED);
    kept.seen = items.length;
    kept.meta = { ...meta, format, ms: Date.now() - started, newest: items.map((i) => i.published).filter(Boolean).sort().at(-1) ?? null, new: kept.filter((u) => !known.has(u.id)).length };
    return kept;
  };

  const results = await mapLimit(feeds, CONCURRENCY, load);
  const now = new Date().toISOString();
  const prevStatus = fixturesDir ? null : await previousJson(path.join(dataDir, STATUS));
  const sources = feedStatus(feeds, results, prevStatus?.sources, now);
  const fresh = [];
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === "fulfilled") {
      console.log(`${r.value.length ? "ok   " : "EMPTY"} ${s.name}: kept ${r.value.length} of ${r.value.seen}`);
      fresh.push(...r.value);
    } else {
      console.warn(`FAIL ${s.name}: ${s.error}`);
    }
  });
  const reachable = sources.filter((s) => s.ok).length;
  if (registry) {
    // The Admin page's health and history. Extra, so a problem here must not fail the build.
    try {
      await writeRegistryFiles(dataDir, registry, { problems, now });
      if (registry.from === "database") {
        const runs = feeds.map((f, i) => sourceRun(f, results[i], now));
        const r = await recordRuns(runs);
        if (!r.skipped) console.log(`sources: recorded ${r.saved} collection runs`);
      }
    } catch (e) {
      console.warn(`sources: could not record runs: ${e.message}`);
    }
  }

  // Keep earlier updates still inside the window, so a feed that's down today doesn't erase its history.
  const previous = prevData?.updates ?? [];
  if (!fresh.length && !fixturesDir && !previous.length) {
    // Nothing new and nothing to fall back on: fail the build so the live site keeps its last good copy.
    throw new Error("No updates collected; leaving existing updates.json untouched.");
  }
  // When every source fails, the page keeps the last good updates and says when they were fetched.
  const updated = reachable || fixturesDir ? now : (prevData?.updated ?? now);
  if (!reachable && !fixturesDir) console.warn(`every source failed; keeping the ${previous.length} updates from ${updated}`);
  stampRetrieved(fresh, previous);
  const updates = pickUpdates([...fresh, ...previous], { checkAge: !fixturesDir });
  // Company Explorer: tag each update with the companies it relates to. Extra, so a
  // problem here must not fail the build.
  let companies = null;
  let overlay = null;
  try {
    // Admin page changes (approval, added or hidden companies) from the database.
    overlay = fixturesDir ? null : await loadOverlay({ previous: () => previousJson(path.join(dataDir, "companies/admin.json"), "companies/admin.json") });
    if (overlay) console.log(`admin: applied ${overlay.overrides?.length ?? 0} company changes and ${overlay.approvals?.length ?? 0} approvals (${overlay.from})`);
    companies = await loadCompanies({ overlay });
    annotateUpdates(updates, companies.idx, companies.countryName);
  } catch (e) {
    console.warn(`companies: matching skipped: ${e.message}`);
  }
  const data = {
    updated,
    checked: now,
    feeds: { total: feeds.length, ok: reachable, failed: feeds.length - reachable },
    ...summarize(updates, agencies),
    updates,
  };
  await writeFile(out, JSON.stringify(data) + "\n");
  await writeRss(updates, agencies, path.join(path.dirname(out), "..", "feed.xml"));
  const site = path.join(path.dirname(out), "..");
  if (await writePublicConfig(path.join(site, "config.json"))) console.log("database: sign-in and team features on");
  if (!fixturesDir) {
    // The archive is extra: a database hiccup must not fail the build.
    const names = new Map(agencies.map((c) => [c.code, c.country]));
    try {
      // The source_id column exists once schema.sql has the registry, which is when the registry came from the database.
      const r = await archiveUpdates(updates, { countryName: (c) => names.get(c) ?? c, withSourceId: registry?.from === "database" });
      if (!r.skipped) console.log(`database: archived ${r.saved} updates`);
    } catch (e) {
      console.warn(`database: archive failed: ${e.message}`);
    }
  }
  if (!fixturesDir) {
    // Research & Innovation has its own sources; a failure there must not fail the build.
    try {
      await collectResearch();
    } catch (e) {
      console.warn(`research: failed: ${e.message}`);
    }
  }
  let research = null;
  try {
    research = JSON.parse(await readFile(path.join(dataDir, "research.json"), "utf8"));
  } catch {}
  if (companies) {
    try {
      const dir = path.join(dataDir, "companies");
      const prev = fixturesDir ? null : await previousJson(path.join(dir, "matches.json"), "companies/matches.json");
      const r = await writeCompanyData({ dir, ctx: companies, updates, papers: research?.papers, previousHistory: prev?.items ?? [] });
      console.log(`companies: wrote ${r.companies} company pages, ${r.matched} matched items`);
    } catch (e) {
      console.warn(`companies: failed: ${e.message}`);
    }
  }
  // Menu and status-strip settings from the Admin page, read by every page.
  await writeFile(path.join(dataDir, "site.json"), JSON.stringify(siteSettings(overlay, now)) + "\n");
  await writeFile(path.join(dataDir, STATUS), JSON.stringify(buildStatus({ checked: now, updated, sources, research, registry: companies?.registry })) + "\n");
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
