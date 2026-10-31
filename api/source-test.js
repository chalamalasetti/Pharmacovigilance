import { eligibleFda, fetchFdaSnapshot, snapshotEntry } from "../scripts/fda-snapshot.mjs";
// Test now for Admin → Data sources: a Vercel serverless function (free on the Hobby
// plan) that fetches a source's address the way the hourly build would and reports the
// response status, the format it found, sample items, how many would be kept, and any
// error in plain words. Only signed-in app admins may call it.
//
//   POST /api/source-test   Authorization: Bearer <the admin's Supabase access token>
//   { "source": { id, type, url, settings, classification, regions, name }, "secrets": { NAME: value } }
//
// The address is checked server-side (scripts/safe-fetch.mjs): private networks, cloud
// metadata services, odd ports and unsafe redirects are refused. Credentials come from the
// database for a saved source, or from the request for one being set up; they are never
// returned or stored with the result. A passing result is recorded in data_source_tests,
// which is what lets the database activate the source or apply the change.

import { publicUpdate } from "../public/privacy.js";
import { createRequire } from "node:module";
import { cloudConfig } from "../scripts/cloud.mjs";
import { countryMatchers } from "../scripts/classify.mjs";
import { parseItems, enrich } from "../scripts/parse.mjs";
import { safeFetch, explainError } from "../scripts/safe-fetch.mjs";
import { cleanSource, feedFromSource, fillSecrets, redact, placeholders } from "../public/sources-lib.js";

const require = createRequire(import.meta.url);
const agencies = require("../public/data/agencies.json");
const ctx = { matchers: countryMatchers(agencies), byCode: new Map(agencies.map((c) => [c.code, c])) };
const SAMPLES = 8;

const authHeaders = (key) => ({ apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }) });

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (raw.length > 100000) throw new Error("Request too large");
  }
  return JSON.parse(raw || "{}");
}

// The caller's email if they are an app admin, checked with their own token.
export async function adminEmail(token, cfg, fetchImpl = fetch) {
  if (!token) return null;
  const headers = { apikey: cfg.publicKey, authorization: `Bearer ${token}`, "content-type": "application/json" };
  const [admin, user] = await Promise.all([
    fetchImpl(`${cfg.url}/rest/v1/rpc/is_app_admin`, { method: "POST", headers, body: "{}", signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : false)),
    fetchImpl(`${cfg.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.json() : null)),
  ]);
  return admin === true && user?.email ? user.email : null;
}

async function savedSecrets(id, cfg, fetchImpl = fetch) {
  if (!id || !cfg.serviceKey) return {};
  const res = await fetchImpl(`${cfg.url}/rest/v1/data_source_secrets?select=name,value&source_id=eq.${encodeURIComponent(id)}`, { headers: authHeaders(cfg.serviceKey), signal: AbortSignal.timeout(10000) });
  return res.ok ? Object.fromEntries((await res.json()).map((s) => [s.name, s.value])) : {};
}

async function record(row, cfg, fetchImpl = fetch) {
  if (!cfg.serviceKey) return false;
  const res = await fetchImpl(`${cfg.url}/rest/v1/data_source_tests`, {
    method: "POST",
    headers: { ...authHeaders(cfg.serviceKey), "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(10000),
  });
  return res.ok;
}

// The test itself, without the HTTP and sign-in parts (also used by the tests).
export async function testSource(raw, secrets = {}, { fetchOpts = {} } = {}) {
  const { source, problems } = cleanSource({ id: "test", name: "Test", classification: "news", ...raw, status: "draft" });
  // The id and name don't matter for a test; the tests' local server uses its own port.
  const fixable = problems.filter((p) => !/source id|name/.test(p) && !(fetchOpts.ports && /standard web ports/.test(p)));
  if (fixable.length) return { ok: false, stage: "check", error: fixable.join(" "), url: source.url };
  const feed = feedFromSource(source);
  const needed = [...placeholders(feed.url), ...Object.values(feed.headers ?? {}).flatMap(placeholders)];
  const missing = needed.filter((n) => secrets[n] == null);
  if (missing.length) return { ok: false, stage: "check", error: `Add the credential ${missing.join(", ")} first (or remove {{${missing[0]}}} from the address).`, url: feed.url };
  const url = fillSecrets(feed.url, secrets).value;
  const headers = Object.fromEntries(Object.entries(feed.headers ?? {}).map(([k, v]) => [k, fillSecrets(v, secrets).value]));
  const started = Date.now();
  const cached = eligibleFda(feed) ? snapshotEntry(await fetchFdaSnapshot(), feed) : null;
  if (cached) {
    const kept = cached.items.map(i => enrich(i,feed,ctx)).filter(Boolean);
    const ids = new Set(kept.map(i=>i.link));
    const dates = cached.items.map(i=>i.published).filter(Boolean).sort();
    const ok = !cached.stale && cached.collectorOk;
    return { ok, stage:"done", status:200, format:"rss", delivery:"github-actions", collectedAt:cached.collectedAt,
      stale:cached.stale, contentType:"application/rss+xml", url:feed.url, items:cached.items.length, kept:kept.length,
      newest:dates.at(-1)??null, oldest:dates[0]??null, ms:Date.now()-started, settings:source.settings, type:source.type,
      ...(!ok && {error:"FDA snapshot is aging or its latest collector attempt failed. Earlier data remains available; wait for a successful collector run."}),
      samples:cached.items.slice(0,SAMPLES).map(i=>({title:i.title,link:i.link,published:i.published,source:feed.source,kept:ids.has(i.link),category:kept.find(k=>k.link===i.link)?.category,country:kept.find(k=>k.link===i.link)?.country})) };
  }
  let res;
  try {
    res = await safeFetch(url, { headers, tries: 1, timeoutMs: 15000, ...fetchOpts });
  } catch (e) {
    return { ok: false, stage: "fetch", status: e.status ?? null, error: redact(explainError(e), secrets), redirects: (e.redirects ?? []).map((r) => ({ ...r, to: redact(r.to, secrets) })), url: feed.url, ms: Date.now() - started };
  }
  const base = { status: res.status, contentType: res.contentType.split(";")[0], finalUrl: redact(res.url, secrets), redirects: res.redirects.map((r) => ({ ...r, to: redact(r.to, secrets) })), bytes: res.body.length, url: feed.url, ms: Date.now() - started };
  let parsed;
  try {
    parsed = parseItems(res.body, feed, { contentType: res.contentType, url: res.url });
  } catch (e) {
    return { ...base, ok: false, stage: "parse", format: e.format ?? null, error: redact(e.message, secrets) };
  }
  const kept = parsed.items.map((i) => enrich(i, feed, ctx)).filter(Boolean);
  const keptBy = new Map(kept.map((u) => [u.link, u]));
  const dates = parsed.items.map((i) => i.published).filter(Boolean).sort();
  return {
    ...base,
    ok: parsed.items.length > 0,
    stage: "done",
    format: parsed.format,
    items: parsed.items.length,
    kept: kept.length,
    newest: dates.at(-1) ?? null,
    oldest: dates[0] ?? null,
    ...(parsed.items.length ? {} : { error: "The address answered, but no items were found in it." }),
    samples: parsed.items.map(publicUpdate).filter(Boolean).slice(0, SAMPLES).map((i) => {
      const u = keptBy.get(i.link);
      return { title: i.title, link: i.link, published: i.published, source: i.source, kept: Boolean(u), ...(u && { category: u.category, country: u.country }) };
    }),
    settings: source.settings,
    type: source.type,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  const cfg = cloudConfig();
  if (!cfg.url || !cfg.publicKey) return send(res, 503, { error: "The database is not connected to this deployment." });
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  let email;
  try {
    email = await adminEmail(token, cfg);
  } catch {
    return send(res, 502, { error: "Could not check your sign-in with the database. Try again." });
  }
  if (!email) return send(res, 403, { error: "Only signed-in admins can test sources." });
  let body;
  try {
    body = await readBody(req);
  } catch {
    return send(res, 400, { error: "The request was not valid JSON." });
  }
  const raw = body.source ?? {};
  const given = Object.fromEntries(Object.entries(body.secrets ?? {}).filter(([k, v]) => /^[A-Z][A-Z0-9_]{1,40}$/.test(k) && typeof v === "string" && v));
  const secrets = { ...(await savedSecrets(raw.id, cfg).catch(() => ({}))), ...given };
  const result = await testSource(raw, secrets);
  let recorded = false;
  if (result.stage !== "check") {
    // What the database compares when the admin activates or saves: the type, the address
    // as stored (with {{NAME}} placeholders, never a value) and the exact settings.
    const { source } = cleanSource({ id: "test", name: "Test", classification: "news", ...raw });
    recorded = await record({ source_id: raw.id || null, url: source.url, source_type: source.type, settings: source.settings, ok: result.ok, http_status: result.status ?? null, format: result.format ?? null, items: result.items ?? null, kept: result.kept ?? null, error: result.error ?? null, by_email: email }, cfg).catch(() => false);
  }
  send(res, 200, { ...result, recorded, testedAt: new Date().toISOString() });
}
