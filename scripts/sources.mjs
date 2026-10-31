// The data source registry, as the hourly build uses it. The registry is managed on
// Admin → Data sources and kept in the database (supabase/schema.sql, "Data sources");
// it is the build's only list of what to collect. Every active source becomes one feed.
//
// Where the registry comes from, in order:
//   1. the database (with the service key, which also reads credentials)
//   2. if the database can't be reached, the registry the live site last used
//      (data/sources/registry.json), so a hiccup never resumes a paused source
//   3. if the database has never been set up, sources.json in the repository, the
//      initial import of the sources collected before the registry existed
//
// After collecting, the build records one run per source in the database, which is
// where the Admin page's health, last attempt and last success come from.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudConfig } from "./cloud.mjs";
import { cleanSource, feedFromSource, publicCoverage, newsSearchUrl } from "../public/sources-lib.js";

export { newsSearchUrl };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance-info.vercel.app").replace(/\/$/, "");
const COLUMNS = "id,name,organization,url,source_type,classification,regions,topics,status,settings,notes,collect_from,created_at,updated_at";
// Runs are kept this long; the Admin page shows at most 30 days.
const KEEP_RUNS_DAYS = 90;

const authHeaders = (key) => ({ apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }) });

export const fromRow = ({ source_type, ...r }) => ({ ...r, type: source_type });

// The registry in the database, with each source's credentials. Returns null when there
// is no service key, and { missing: true } when the tables don't exist yet.
export async function fetchRegistry(cfg = cloudConfig(), fetchImpl = fetch) {
  if (!cfg.url || !cfg.serviceKey) return null;
  const get = async (q) => {
    const res = await fetchImpl(`${cfg.url}/rest/v1/${q}`, { headers: authHeaders(cfg.serviceKey), signal: AbortSignal.timeout(20000) });
    if (res.status === 404 || res.status === 400) {
      const body = await res.text();
      // PostgREST: relation does not exist (schema.sql not re-run yet).
      if (/PGRST205|42P01|does not exist|Could not find the table/i.test(body)) return { missing: true };
      throw new Error(`${q.split("?")[0]} HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(`${q.split("?")[0]} HTTP ${res.status}`);
    return res.json();
  };
  const rows = await get(`data_sources?select=${COLUMNS}&order=id`);
  if (rows.missing) return { missing: true };
  const secrets = await get("data_source_secrets?select=source_id,name,value");
  const byId = new Map();
  for (const s of secrets.missing ? [] : secrets) byId.set(s.source_id, { ...byId.get(s.source_id), [s.name]: s.value });
  return { sources: rows.map(fromRow), secrets: byId };
}

export async function seedRegistry(file = path.join(ROOT, "sources.json")) {
  return JSON.parse(await readFile(file, "utf8")).sources;
}

// Once cloud configuration exists, repository seeds are never an outage fallback.
// Empty snapshots are valid: an administrator may deliberately remove every source.
export async function loadRegistry({ cfg = cloudConfig(), fetchImpl = fetch, previous = null, seed = seedRegistry } = {}) {
  const managed = Boolean(cfg.url || cfg.serviceKey);
  if (cfg.url && cfg.serviceKey) {
    try {
      const live = await fetchRegistry(cfg, fetchImpl);
      if (live && !live.missing) return { ...live, from: "database" };
    } catch {
      console.warn("sources: database unavailable; checking the last managed registry");
    }
  }
  if (!managed && !previous) return { sources: await seed(), secrets: new Map(), from: "repository" };
  let prev;
  try {
    prev = previous ? await previous() : await fetchImpl(`${SITE_URL}/data/sources/registry.json`, { signal: AbortSignal.timeout(20000) }).then((r) => r.ok ? r.json() : null);
  } catch {}
  if (prev && ["database", "last build"].includes(prev.from) && Array.isArray(prev.sources)) {
    return { sources: prev.sources, secrets: new Map(), from: "last build" };
  }
  if (managed) throw new Error("Source registry unavailable: collection stopped. Restore the database or a managed snapshot; repository seeds will not be activated.");
  return { sources: await seed(), secrets: new Map(), from: "repository" };
}

// The feeds to collect: active sources that pass the registry's checks. A source with a
// problem is skipped and reported, never silently changed.
export function buildFeeds(registry) {
  const feeds = [];
  const problems = [];
  for (const raw of registry.sources) {
    if (raw.status !== "active") continue;
    const { source, problems: p } = cleanSource(raw);
    if (p.length) {
      problems.push({ id: raw.id, problem: p.join(" ") });
      continue;
    }
    feeds.push(feedFromSource({ ...source, collect_from: raw.collect_from }));
  }
  return { feeds, problems };
}

// data/sources/registry.json (what this build collected from, without credential values,
// for the Admin page and the next build's fallback) and data/coverage.json (the public list).
export async function writeRegistryFiles(dataDir, registry, { problems = [], now = new Date().toISOString() } = {}) {
  await mkdir(path.join(dataDir, "sources"), { recursive: true });
  const sources = registry.sources.map((s) => ({
    id: s.id, name: s.name, organization: s.organization ?? "", type: s.type, classification: s.classification,
    regions: s.regions ?? [], topics: s.topics ?? [], status: s.status, url: s.url ?? "", settings: s.settings ?? {},
    ...(s.collect_from && { collect_from: s.collect_from }),
    ...(registry.secrets?.get(s.id) && { credentials: Object.keys(registry.secrets.get(s.id)) }),
  }));
  await writeFile(path.join(dataDir, "sources", "registry.json"), JSON.stringify({ built: now, from: registry.from, problems, sources }) + "\n");
  await writeFile(path.join(dataDir, "coverage.json"), JSON.stringify(publicCoverage(sources, now)) + "\n");
}

// One row per collected source for the Admin page's health and history.
export async function recordRuns(runs, { cfg = cloudConfig(), fetchImpl = fetch, now = new Date() } = {}) {
  if (!cfg.url || !cfg.serviceKey || !runs.length) return { skipped: true };
  const headers = { ...authHeaders(cfg.serviceKey), "content-type": "application/json", prefer: "return=minimal" };
  const res = await fetchImpl(`${cfg.url}/rest/v1/data_source_runs`, { method: "POST", headers, body: JSON.stringify(runs), signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`runs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const cutoff = new Date(now.getTime() - KEEP_RUNS_DAYS * 86400000).toISOString();
  await fetchImpl(`${cfg.url}/rest/v1/data_source_runs?run_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers, signal: AbortSignal.timeout(30000) }).catch(() => {});
  return { skipped: false, saved: runs.length };
}
