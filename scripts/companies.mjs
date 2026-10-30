// The public Company Explorer's data, rebuilt on every hourly build from
// companies/manifest.json, companies/registry.json (refreshed weekly by registry.mjs),
// the current updates and the research papers. Writes, under public/data/companies/:
//
//   index.json      every manifest company: names for search, coverage, match counts
//   products.json   brand and substance -> companies, for product and substance search
//   matches.json    every update and paper matched to a company, kept for a year so
//                   a company's history outlives the 60-day updates window
//   <id>.json       one company's profile, products, related updates and research
//
// Only public data goes in: nothing here reads a team, a portfolio or a sign-in.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANIFEST, SOURCES, REGISTRY } from "./registry.mjs";
import { buildIndex, matchText, updateText, paperText, MATCH_RULES } from "./company-match.mjs";

const KEEP_DAYS = 365;
const MAX_HISTORY = 6000;
const LANE_ORDER = { direct: 0, substance: 1, class: 2, corporate: 3 };

export async function loadCompanies() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const register = JSON.parse(await readFile(SOURCES, "utf8"));
  let registry = null;
  try {
    registry = JSON.parse(await readFile(REGISTRY, "utf8"));
  } catch {}
  let names = new Map();
  try {
    const agencies = JSON.parse(await readFile(fileURLToPath(new URL("../public/data/agencies.json", import.meta.url)), "utf8"));
    names = new Map(agencies.map((a) => [a.code, a.country]));
  } catch {}
  return { manifest, register, registry, idx: buildIndex(manifest, registry), countryName: (c) => names.get(c) ?? c };
}

const slim = (m) => ({ id: m.id, lane: m.lane });

// Adds `co` (company id and lane) to each update, for the Updates page filter and badges.
export function annotateUpdates(updates, idx, countryName) {
  for (const u of updates) {
    const found = matchText(idx, updateText(u), { country: u.country, kind: "update", countryName });
    if (found.length) u.co = found.sort((a, b) => LANE_ORDER[a.lane] - LANE_ORDER[b.lane]).map(slim);
    else delete u.co;
  }
  return updates;
}

// Current matches replace earlier ones for the same item (re-running never duplicates);
// items no longer in the feed keep the matches, and reasons, they had when last seen.
export function mergeHistory(current, previous = [], now = new Date()) {
  const byId = new Map(previous.map((x) => [x.id, x]));
  for (const x of current) byId.set(x.id, x);
  const cutoff = new Date(now - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  return [...byId.values()]
    .filter((x) => x.co.length && (!x.published || x.published.slice(0, 10) >= cutoff))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .slice(0, MAX_HISTORY);
}

const strip = ({ markets, ...m }) => m;

export function matchItems(idx, updates, papers, countryName) {
  const items = [];
  for (const u of updates) {
    const co = matchText(idx, updateText(u), { country: u.country, kind: "update", countryName }).map(strip);
    if (co.length) items.push({ id: u.id, kind: "update", title: u.title, link: u.link, source: u.agency ? `${u.agency} (${u.source})` : u.source, country: u.country, category: u.category, official: u.kind === "official", published: u.published, rules: MATCH_RULES, co });
  }
  for (const p of papers ?? []) {
    const co = matchText(idx, paperText(p), { kind: "paper" }).filter((m) => m.lane !== "corporate").map(strip);
    if (co.length) items.push({ id: `paper:${p.id}`, kind: "paper", paper: p.id, title: p.title, venue: p.venue, type: p.type, peerReview: p.peerReview, published: p.published, rules: MATCH_RULES, co });
  }
  return items;
}

const MARKET_SOURCES = { US: "fda-orange-book", EU: "ema-medicines" };

function coverage(c, products, registry) {
  const markets = [...new Set(products.map((p) => p.market))].sort();
  const failing = (registry?.sources ?? []).filter((s) => !s.ok).map((s) => s.id);
  const missing = Object.keys(MARKET_SOURCES).filter((m) => !markets.includes(m));
  return {
    products: products.length,
    markets,
    status: !products.length ? "not-mapped" : missing.length ? "partial" : "mapped",
    note: !products.length
      ? `No products from the current sources (FDA Orange Book, EMA) are linked to ${c.name} yet. This is a gap in mapping, not a statement that the company has no products.`
      : `Products linked from ${markets.map((m) => (m === "US" ? "FDA Orange Book" : "EMA")).join(" and ")} records. Other markets, nationally authorised products${markets.includes("US") ? " and US biologics" : ""} are not mapped yet.`,
    ...(failing.length && { staleSources: failing }),
  };
}

// The data for every page, as plain objects (written to disk by writeCompanyData).
export function buildCompanyData({ manifest, register, registry, history, now = new Date().toISOString() }) {
  const byCompany = new Map(manifest.companies.map((c) => [c.id, []]));
  for (const p of registry?.products ?? []) byCompany.get(p.company)?.push(p);
  const related = new Map(manifest.companies.map((c) => [c.id, { updates: [], research: [] }]));
  for (const x of history) {
    for (const m of x.co) {
      const r = related.get(m.id);
      if (!r) continue;
      const { co, ...item } = x;
      const entry = { ...item, lane: m.lane, label: m.label, reason: m.reason, terms: m.terms, ...(m.outside && { outside: m.outside }), shared: co.length };
      (x.kind === "paper" ? r.research : r.updates).push(entry);
    }
  }
  const sourceInfo = (registry?.sources ?? []).map(({ id, name, ok, lastSuccess, error, stale }) => ({ id, name, ok, lastSuccess, ...(error && { error }), ...(stale && { stale }) }));
  const files = new Map();
  const index = [];
  const nameOf = new Map(manifest.companies.map((c) => [c.id, c.name]));
  for (const c of manifest.companies) {
    const products = byCompany.get(c.id);
    const cov = coverage(c, products, registry);
    const r = related.get(c.id);
    const holders = new Map();
    for (const p of products) holders.set(`${p.src}|${p.holder}`, (holders.get(`${p.src}|${p.holder}`) ?? 0) + 1);
    const counts = (list) => list.reduce((acc, x) => ((acc[x.lane] = (acc[x.lane] ?? 0) + 1), acc), {});
    const profile = {
      id: c.id,
      name: c.name,
      legal: c.legal,
      country: c.country,
      region: c.region,
      types: c.types,
      aliases: c.aliases ?? [],
      former: c.former ?? [],
      ...(c.parent && { parent: { ...c.parent, name: nameOf.get(c.parent.id) } }),
      ...(c.history && { history: c.history }),
      ...(c.distinctFrom && { distinctFrom: c.distinctFrom.map((id) => ({ id, name: nameOf.get(id) ?? id })) }),
      ...(c.verify && { verify: c.verify }),
    };
    index.push({ ...profile, coverage: { status: cov.status, products: cov.products, markets: cov.markets }, counts: counts(r.updates) });
    files.set(c.id, {
      built: now,
      rules: MATCH_RULES,
      manifest: { version: manifest.version, status: manifest.status },
      profile: { ...profile, entities: c.entities ?? [], mentions: c.mentions ?? [] },
      coverage: cov,
      holders: [...holders].map(([k, n]) => ({ src: k.split("|")[0], name: k.split("|").slice(1).join("|"), products: n })).sort((a, b) => b.products - a.products),
      products: products.map(({ company, moieties, ...p }) => p),
      updates: r.updates,
      research: r.research,
      sources: sourceInfo,
    });
  }
  // Brand and substance -> companies, for search by product or substance.
  const terms = new Map();
  const addTerm = (kind, name, p) => {
    const key = `${kind}|${name.toLowerCase()}`;
    if (!terms.has(key)) terms.set(key, { kind, name, companies: new Map() });
    const t = terms.get(key);
    if (!t.companies.has(p.company)) t.companies.set(p.company, new Set());
    t.companies.get(p.company).add(p.market);
  };
  for (const p of registry?.products ?? []) {
    if (!byCompany.has(p.company)) continue;
    for (const m of p.moieties ?? []) addTerm("substance", m, p);
    if (p.brand && !(p.moieties ?? []).includes(p.brand.toLowerCase())) addTerm("brand", p.brand.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase()), p);
  }
  const products = [...terms.values()]
    .map((t) => ({ k: t.kind === "brand" ? "b" : "s", n: t.name, c: [...t.companies].map(([id, ms]) => [id, [...ms].sort().join(",")]) }))
    .sort((a, b) => a.n.localeCompare(b.n));
  return {
    index: {
      built: now,
      manifest: { version: manifest.version, status: manifest.status, approvedBy: manifest.approvedBy, approvedOn: manifest.approvedOn, note: manifest.note, criteria: manifest.criteria },
      ambiguous: manifest.ambiguous ?? [],
      registry: registry ? { built: registry.built, sources: sourceInfo } : null,
      register: register.sources.map(({ id, name, status, page, jurisdictions, cadence, reuse, access, limitations }) => ({ id, name, status, page, jurisdictions, cadence, reuse, access, limitations })),
      unmapped: (registry?.unmapped ?? []).slice(0, 50),
      companies: index,
    },
    products: { built: now, terms: products },
    files,
  };
}

export async function writeCompanyData({ dir, ctx, updates, papers, previousHistory = [], now = new Date() }) {
  const history = mergeHistory(matchItems(ctx.idx, updates, papers, ctx.countryName), previousHistory, now);
  const data = buildCompanyData({ ...ctx, history, now: now.toISOString() });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.json"), JSON.stringify(data.index) + "\n");
  await writeFile(path.join(dir, "products.json"), JSON.stringify(data.products) + "\n");
  await writeFile(path.join(dir, "matches.json"), JSON.stringify({ updated: now.toISOString(), rules: MATCH_RULES, items: history }) + "\n");
  for (const [id, f] of data.files) await writeFile(path.join(dir, `${id}.json`), JSON.stringify(f) + "\n");
  return { companies: data.files.size, matched: history.length };
}
