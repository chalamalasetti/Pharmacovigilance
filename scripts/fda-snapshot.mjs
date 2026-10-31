// Fixed-origin, privacy-screened regulator feed snapshot. No generic proxy or credentials.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { safeFetch } from './safe-fetch.mjs';
import { parseItems } from './parse.mjs';
import { publicUpdate } from '../public/privacy.js';
export const FDA_URLS = Object.fromEntries(['medwatch','drugs','biologics','press-releases','recalls'].map(x => [`fda-${x}`, `https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/${x}/rss.xml`]));
export const REGULATOR_URLS = { ...FDA_URLS, 'tga-safety-alerts': 'https://www.tga.gov.au/feeds/alert/safety-alerts.xml' };
export const SNAPSHOT_URL = 'https://raw.githubusercontent.com/chalamalasetti/Pharmacovigilance/fda-feed-cache/fda-feeds.json';
export const MAX_AGE_MS = 12 * 3600000;
export const STALE_MS = 2 * 3600000;
export const eligibleSnapshot = f => f.type === 'rss' && f.kind === 'official' && REGULATOR_URLS[f.id] === f.url;
export function snapshotEntry(snapshot, feed, now = Date.now()) {
  if (!eligibleSnapshot(feed) || snapshot?.version !== 1) return null;
  const e = snapshot.entries?.find(e => e.id === feed.id && e.url === feed.url);
  const age = now - Date.parse(e?.collectedAt);
  if (!Number.isFinite(age) || age < -60000 || age > MAX_AGE_MS || !Array.isArray(e?.items) || !e.items.length || e.items.length > 100) return null;
  const items = e.items.map(publicUpdate).filter(Boolean).filter(x => {
    try { const u = new URL(x.link); const host = feed.id === 'tga-safety-alerts' ? 'tga.gov.au' : 'fda.gov'; return u.protocol === 'https:' && (u.hostname === host || u.hostname.endsWith('.'+host)); } catch { return false; }
  });
  if (!items.length) return null;
  return { items, collectedAt: e.collectedAt, stale: age > STALE_MS, lastAttempt: e.lastAttempt, collectorOk: e.ok === true };
}
export async function fetchRegulatorSnapshot(fetcher = safeFetch) {
  try {
    const r = await fetcher(SNAPSHOT_URL, { tries: 1, timeoutMs: 10000, maxBytes: 512000 });
    return JSON.parse(r.body);
  } catch { return null; }
}
export async function collectRegulators({ registry, previous = null, fetcher = safeFetch, now = new Date() }) {
  const entries = [];
  // A failed registry fetch must not activate repository defaults. Caller supplies
  // the last published active configuration, never source credentials.
  for (const s of registry.sources ?? []) {
    const feed = { id: s.id, url: s.url, source: s.name, type: s.type, kind: s.classification === 'regulator' ? 'official' : 'news' };
    if (s.status !== 'active' || !eligibleSnapshot(feed)) continue;
    try {
      const r = await fetcher(s.url, { tries: 2, timeoutMs: 20000 });
      const parsed = parseItems(r.body, feed, { contentType: r.contentType, url: r.url });
      const candidate = { version: 1, entries: [{ id: s.id, url: s.url, items: parsed.items.slice(0,100), collectedAt: now.toISOString() }] };
      const clean = snapshotEntry(candidate, feed, +now);
      if (!clean) throw new Error('No usable regulator items');
      entries.push({ id: s.id, url: s.url, collectedAt: clean.collectedAt, lastAttempt: now.toISOString(), ok: true, items: clean.items });
      console.log(`${s.id}: ${clean.items.length} privacy-screened regulator items`);
    } catch {
      const old = snapshotEntry(previous, feed, +now);
      entries.push({ id: s.id, url: s.url, lastAttempt: now.toISOString(), ok: false, error: 'Regulator collection failed; last successful snapshot retained within expiry only.', ...(old && { collectedAt: old.collectedAt, items: old.items }) });
    }
  }
  return { version: 1, attemptedAt: now.toISOString(), collector: 'github-actions', entries };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await safeFetch('https://pharmacovigilance-info.vercel.app/data/sources/registry.json', { tries: 2, maxBytes: 512000 });
  const registry = JSON.parse(r.body);
  if (!Array.isArray(registry.sources) || !['database','last build','repository'].includes(registry.from)) throw new Error('Registry unavailable; no regulator defaults activated');
  let previous = null;
  try { previous = JSON.parse(await readFile(process.argv[3] ?? '/tmp/previous-fda.json', 'utf8')); } catch {}
  const data = await collectRegulators({ registry, previous });
  await writeFile(process.argv[2] ?? '/tmp/fda-feeds.json', JSON.stringify(data)+'\n');
}
