// The data source registry's shared rules, used by the build (scripts/sources.mjs), the
// Test now function (api/source-test.js) and the Admin → Data sources page. A source is
// one feed, API, web page or news search the hourly build collects updates from. The
// registry lives in the database (supabase/schema.sql, "Data sources"); sources.json in
// the repository is only the initial import and the fallback before the database is set up.

export const SOURCE_TYPES = [
  { id: "rss", label: "RSS/Atom feed" },
  { id: "api", label: "JSON API" },
  { id: "webpage", label: "Web page" },
  { id: "news_search", label: "News search" },
];

export const CLASSIFICATIONS = [
  { id: "regulator", label: "Official regulator" },
  { id: "research", label: "Research" },
  { id: "vendor", label: "Vendor" },
  { id: "news", label: "Secondary news" },
];

// Administrative status, set by an admin. Collection health is separate (sourceHealth).
export const STATUSES = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "draft", label: "Draft" },
];

export const HEALTH = [
  { id: "successful", label: "Successful" },
  { id: "failed", label: "Failed" },
  { id: "stale", label: "Stale" },
  { id: "never", label: "Never collected" },
];

// What a source covers, for the admin table and the public coverage page. Descriptive
// only: the section each update lands in still comes from the keyword rules.
export const TOPICS = [
  { id: "safety", label: "Safety alerts" },
  { id: "recall", label: "Recalls and quality" },
  { id: "label", label: "Labeling" },
  { id: "guideline", label: "Guidance" },
  { id: "regulation", label: "Regulation" },
  { id: "policy", label: "Policy" },
  { id: "inspection", label: "Inspections" },
  { id: "approval", label: "Approvals" },
  { id: "systems", label: "PV systems and reporting" },
  { id: "research", label: "Research" },
  { id: "news", label: "Industry news" },
];

export const NEWS_PROVIDERS = [{ id: "google_news", label: "Google News" }];

export const label = (list, id) => list.find((x) => x.id === id)?.label ?? id;

export const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A credential is written into a URL or header as {{NAME}} and kept in the database.
export const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,40}$/;
const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]{1,40})\}\}/g;
const SECRET_PARAM = /^(api[_-]?key|apikey|key|token|access[_-]?token|secret|client[_-]?secret|password|passwd|pwd|signature|sig|auth)$/i;

// Google News RSS search. Admins edit the query; the address is always rebuilt from it.
export function newsSearchUrl(query, { hl = "en-US", gl = "US", window = "30d" } = {}) {
  const q = encodeURIComponent(`${query}${window ? ` when:${window}` : ""}`);
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;
}

// The address the build fetches, before credentials are filled in.
export function sourceUrl(src) {
  if (src.type === "news_search") {
    const s = src.settings ?? {};
    return newsSearchUrl(s.query ?? "", { hl: s.hl || "en-US", gl: s.gl || "US", window: s.window ?? "30d" });
  }
  return String(src.url ?? "").trim();
}

export const placeholders = (s) => [...String(s ?? "").matchAll(PLACEHOLDER)].map((m) => m[1]);

// Fills {{NAME}} from the source's credentials. Missing ones are reported, never guessed.
export function fillSecrets(s, secrets = {}) {
  const missing = [];
  const out = String(s).replace(PLACEHOLDER, (_, n) => {
    if (secrets[n] == null) {
      missing.push(n);
      return "";
    }
    return encodeURIComponent(secrets[n]);
  });
  return { value: out, missing };
}

// Removes credential values from text that is about to be shown or saved (an error
// message can quote the address it failed on).
export function redact(text, secrets = {}) {
  let out = String(text ?? "");
  for (const v of Object.values(secrets)) {
    if (!v || String(v).length < 4) continue;
    for (const form of new Set([String(v), encodeURIComponent(v)])) out = out.split(form).join("•••");
  }
  return out;
}

// Problems with an address an admin typed, in plain words. The server checks again
// (supabase/schema.sql source_url_problem, and scripts/safe-fetch.mjs before every fetch).
export function urlProblem(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "Enter the address.";
  if (s.length > 2000) return "The address is too long.";
  let u;
  try {
    u = new URL(s.replace(PLACEHOLDER, "x"));
  } catch {
    return "That is not a web address. It should start with https://";
  }
  if (!/^https?:$/.test(u.protocol)) return "Only http:// and https:// addresses can be collected.";
  if (u.username || u.password) return "Do not put a user name or password in the address. Add it as a credential instead.";
  if (u.port && !["80", "443"].includes(u.port)) return "Only the standard web ports (80 and 443) are allowed.";
  for (const [k, v] of new URL(s.replace(PLACEHOLDER, "PLACEHOLDER")).searchParams) {
    if (SECRET_PARAM.test(k) && v !== "PLACEHOLDER") return `The address contains a ${k} value. Save it as a credential and write {{${k.toUpperCase().replace(/[^A-Z0-9]/g, "_")}}} in the address instead, so it is never shown.`;
  }
  return null;
}

const list = (v) => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))] : []);

// Tidies a source from the admin form or the database into the registry's shape, and
// lists what is wrong with it. `problems` empty means it can be saved.
export function cleanSource(raw) {
  const s = raw ?? {};
  const settings = { ...(s.settings ?? {}) };
  const src = {
    id: String(s.id ?? "").trim(),
    name: String(s.name ?? "").trim(),
    organization: String(s.organization ?? "").trim(),
    type: s.type ?? s.source_type,
    classification: s.classification,
    regions: list(s.regions).map((r) => r.toUpperCase()),
    topics: list(s.topics),
    status: s.status ?? "draft",
    settings,
    notes: String(s.notes ?? "").trim(),
  };
  const problems = [];
  if (!ID.test(src.id) || src.id.length > 60) problems.push("The source id must be lower-case letters, numbers and dashes.");
  if (src.name.length < 2) problems.push("Give the source a name.");
  if (!SOURCE_TYPES.some((t) => t.id === src.type)) problems.push("Choose a source type.");
  if (!CLASSIFICATIONS.some((c) => c.id === src.classification)) problems.push("Choose a classification.");
  if (!STATUSES.some((x) => x.id === src.status)) problems.push("Status must be active, paused or draft.");
  if (src.regions.some((r) => !/^[A-Z]{2,3}$/.test(r))) problems.push("Regions are two-letter country codes, EU or INT.");
  if (!["pv", "all"].includes(settings.relevance ?? "pv")) problems.push("Relevance must be pv or all.");
  if (src.type === "news_search") {
    if (!String(settings.query ?? "").trim()) problems.push("Enter the search query.");
    settings.provider ??= "google_news";
    if (!NEWS_PROVIDERS.some((p) => p.id === settings.provider)) problems.push("Choose a news search provider.");
    src.url = sourceUrl(src);
  } else {
    src.url = String(s.url ?? "").trim();
    const p = urlProblem(src.url);
    if (p) problems.push(p);
  }
  if (src.type === "webpage" && settings.linkPattern) {
    try {
      new RegExp(settings.linkPattern);
    } catch {
      problems.push("The link pattern is not a valid regular expression.");
    }
  }
  for (const [k, v] of Object.entries(settings.headers ?? {})) {
    if (/^(authorization|x-api-key|api-key|apikey|cookie)$/i.test(k) && !placeholders(v).length) problems.push(`The ${k} header holds a credential. Save it as a credential and write {{NAME}} in the header instead.`);
  }
  return { source: src, problems };
}

// The feed the build collects for an active source: the shape scripts/aggregate.mjs
// has always used, plus the registry id. Official regulators are placed in their own
// country; everything else is placed by what it mentions.
export function feedFromSource(src) {
  const s = src.settings ?? {};
  const official = src.classification === "regulator";
  return {
    id: src.id,
    source: src.name,
    country: src.regions?.[0] ?? null,
    kind: official ? "official" : "news",
    relevance: s.relevance ?? "pv",
    ...(s.category && { category: s.category }),
    type: src.type,
    url: sourceUrl(src),
    ...(s.headers && { headers: s.headers }),
    ...(s.itemsPath !== undefined && { itemsPath: s.itemsPath }),
    ...(s.fields && { fields: s.fields }),
    ...(s.linkPattern && { linkPattern: s.linkPattern }),
    ...(src.collect_from && { since: src.collect_from }),
  };
}

// How a source is doing at collection, from its runs (admin_source_stats). Kept apart
// from its status: a paused source keeps the health it had when it was last collected.
export const STALE = {
  notCollectedMs: 6 * 3600000, // an active source the build has not tried for this long
  officialQuietDays: 45, // a regulator feed whose newest item is older than this
  otherQuietDays: 14,
};

export function sourceHealth(src, stats, now = Date.now(), t = STALE) {
  if (!stats?.last_attempt) return "never";
  if (!stats.last_ok) return "failed";
  if (src.status === "active" && now - Date.parse(stats.last_attempt) > t.notCollectedMs) return "stale";
  if (stats.last_items === 0) return "stale";
  const quiet = (src.classification === "regulator" ? t.officialQuietDays : t.otherQuietDays) * 86400000;
  if (stats.newest_item && now - Date.parse(stats.newest_item) > quiet) return "stale";
  return "successful";
}

// Why a source is stale, for the tooltip next to its health.
export function staleReason(src, stats, now = Date.now(), t = STALE) {
  if (src.status === "active" && now - Date.parse(stats.last_attempt) > t.notCollectedMs) return "Not collected in the last 6 hours.";
  if (stats.last_items === 0) return "The last collection found no items.";
  return `Nothing new published since ${stats.newest_item.slice(0, 10)}.`;
}

// The cards above the admin table.
export function summaryCounts(sources, statsById = new Map(), now = Date.now()) {
  const c = { configured: sources.length, active: 0, paused: 0, draft: 0, failing: 0, stale: 0 };
  for (const s of sources) {
    c[s.status] = (c[s.status] ?? 0) + 1;
    if (s.status !== "active") continue;
    const h = sourceHealth(s, statsById.get(s.id), now);
    if (h === "failed") c.failing++;
    if (h === "stale") c.stale++;
  }
  return c;
}

// The public coverage list (data/coverage.json): active sources only, without addresses,
// settings, credentials, notes or collection health.
export function publicCoverage(sources, now = new Date().toISOString()) {
  const active = sources.filter((s) => s.status === "active");
  const tally = (key) => Object.fromEntries([...new Set(active.flatMap((s) => [].concat(s[key])))].sort().map((k) => [k, active.filter((s) => [].concat(s[key]).includes(k)).length]));
  return {
    built: now,
    total: active.length,
    byClassification: tally("classification"),
    byType: tally("type"),
    sources: active
      .map(({ id, name, organization, type, classification, regions, topics }) => ({ id, name, organization, type, classification, regions, topics }))
      .sort((a, b) => a.classification.localeCompare(b.classification) || a.name.localeCompare(b.name)),
  };
}
