// Changes made on the Admin page (public/admin.html), applied over the repo files at
// every build. Admins approve a version of companies/manifest.json and add, edit or
// hide companies; those choices live in the database (supabase/schema.sql, "Admin
// console"), so nobody edits the repo or runs SQL for them. The repo manifest stays
// the editorial base, and removing an admin change brings its repo entry back.
//
// The build publishes what it applied as data/companies/admin.json. The Admin page
// reads it to show what is live and any change the build could not use, and the weekly
// registry run (registry.mjs) reads it from the live site when it has no database keys.

import { cloudConfig } from "./cloud.mjs";
import { normName } from "./registry.mjs";

export const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance-info.vercel.app").replace(/\/$/, "");

const LIST_FIELDS = ["aliases", "former", "mentions", "holders", "types"];
const TEXT_FIELDS = { name: 120, legal: 160, history: 600 };
export const EDITABLE = ["name", "legal", "country", "region", "types", ...LIST_FIELDS.filter((f) => f !== "types"), "history"];
const MAX_LIST = 40;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const authHeaders = (key) => ({ apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }) });

// Public columns only, so admin emails never reach the site.
export async function fetchOverlay(cfg = cloudConfig(), fetchImpl = fetch) {
  const key = cfg.serviceKey || cfg.publicKey;
  if (!cfg.url || !key) return null;
  const get = async (pathAndQuery) => {
    const res = await fetchImpl(`${cfg.url}/rest/v1/${pathAndQuery}`, { headers: authHeaders(key), signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`${pathAndQuery.split("?")[0]} HTTP ${res.status}`);
    return res.json();
  };
  const [approvals, overrides, settings] = await Promise.all([
    get("manifest_approvals?select=version,status,approved_by,approved_on,note,updated_at"),
    get("company_overrides?select=company_id,data,hidden,note,updated_at&order=company_id"),
    // Older databases have no site_settings table yet; the site then keeps its defaults.
    get("site_settings?select=key,value,updated_at").catch(() => []),
  ]);
  return { fetched: new Date().toISOString(), approvals, overrides, settings };
}

// The database first; if it is unreachable, the overlay the live site last applied, so
// a database hiccup never undoes an approval or brings back a hidden company.
// `previous` returns that last overlay's file (admin.json); by default it is read from the live site.
export async function loadOverlay({ cfg = cloudConfig(), fetchImpl = fetch, previous = null } = {}) {
  try {
    const live = await fetchOverlay(cfg, fetchImpl);
    if (live) return { ...live, from: "database" };
  } catch (e) {
    console.warn(`admin: database unavailable (${e.message}); using the last applied admin changes`);
  }
  try {
    const prev = previous ? await previous() : await fetchImpl(`${SITE_URL}/data/companies/admin.json`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null));
    if (prev?.overlay) return { ...prev.overlay, from: "last build" };
  } catch {}
  return null;
}

const cleanText = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const cleanList = (v) =>
  Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, MAX_LIST) : undefined;

// Checks one admin change; returns the usable fields and what was wrong.
export function cleanFields(data, { regions, isNew }) {
  const out = {};
  const problems = [];
  for (const [f, max] of Object.entries(TEXT_FIELDS)) {
    const v = cleanText(data?.[f], max);
    if (v !== undefined) out[f] = v;
  }
  for (const f of LIST_FIELDS) {
    const v = cleanList(data?.[f]);
    if (v !== undefined) out[f] = v;
  }
  if (data?.country !== undefined) {
    const c = String(data.country).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(c)) out.country = c;
    else problems.push(`country "${data.country}" is not a two-letter code`);
  }
  if (data?.region !== undefined) {
    if (regions.has(data.region)) out.region = data.region;
    else problems.push(`region "${data.region}" is not one of ${[...regions].join(", ")}`);
  }
  if (out.holders) out.holders = [...new Set(out.holders.map(normName).filter((h) => h.length >= 3))];
  if (out.mentions) {
    const short = out.mentions.filter((m) => m.length < 3);
    if (short.length) problems.push(`mentions shorter than 3 letters were left out (${short.join(", ")})`);
    out.mentions = out.mentions.filter((m) => m.length >= 3);
  }
  if (isNew) {
    for (const f of ["name", "country", "region"]) if (!out[f]) problems.push(`a new company needs a ${f}`);
    if (!out.types?.length) problems.push("a new company needs at least one type");
  }
  return { fields: out, problems };
}

// Applies the admin changes to the repo manifest. Returns the manifest the site uses,
// with each company marked by where it came from, and every change that was skipped.
export function applyOverlay(manifest, overlay) {
  const out = structuredClone(manifest);
  const problems = [];
  const applied = { approval: null, added: [], edited: [], hidden: [] };
  if (!overlay) return { manifest: out, applied, problems };

  const approval = (overlay.approvals ?? []).find((a) => a.version === manifest.version);
  if (approval) {
    applied.approval = approval;
    if (approval.status === "approved") Object.assign(out, { status: "approved", approvedBy: approval.approved_by, approvedOn: approval.approved_on });
    else Object.assign(out, { status: "draft", approvedBy: null, approvedOn: null });
  }

  const regions = new Set(manifest.companies.map((c) => c.region));
  const byId = new Map(out.companies.map((c) => [c.id, c]));
  const hidden = new Set();
  for (const o of overlay.overrides ?? []) {
    const id = o.company_id;
    if (!ID.test(id ?? "")) {
      problems.push({ id, problem: "the company id must be lower case letters, numbers and dashes" });
      continue;
    }
    if (o.hidden) {
      if (byId.has(id)) {
        hidden.add(id);
        applied.hidden.push(id);
      }
      continue;
    }
    const existing = byId.get(id);
    const { fields, problems: found } = cleanFields(o.data, { regions, isNew: !existing });
    for (const p of found) problems.push({ id, problem: p });
    if (existing) {
      if (!Object.keys(fields).length) continue;
      Object.assign(existing, fields, { edited: o.updated_at ?? true });
      applied.edited.push(id);
    } else {
      if (found.some((p) => p.startsWith("a new company"))) continue;
      const c = { id, aliases: [], former: [], mentions: [fields.name], holders: [], entities: [], ...fields, added: o.updated_at ?? true };
      out.companies.push(c);
      byId.set(id, c);
      applied.added.push(id);
    }
  }
  if (hidden.size) {
    out.companies = out.companies.filter((c) => !hidden.has(c.id));
    for (const c of out.companies) {
      if (c.parent && hidden.has(c.parent.id)) delete c.parent;
      if (c.distinctFrom) c.distinctFrom = c.distinctFrom.filter((x) => !hidden.has(x));
    }
    out.ambiguous = (out.ambiguous ?? []).map((a) => ({ ...a, candidates: a.candidates.filter((x) => !hidden.has(x)) })).filter((a) => a.candidates.length);
  }
  return { manifest: out, applied, problems };
}

// The menu's pages ("index" is Updates), in their default order. Admins may reorder all
// of them and hide any but Updates; Sign in always stays last.
export const NAV = ["index", "briefing", "research", "companies", "team", "archive", "globe", "agencies", "about"];
export const HIDEABLE_NAV = NAV.filter((x) => x !== "index");

// data/site.json: settings every page reads (nav.js). The status strip is for admins
// unless an admin chose to show it to everyone.
export function siteSettings(overlay, now = new Date().toISOString()) {
  const get = (k) => (overlay?.settings ?? []).find((x) => x.key === k)?.value;
  const hidden = get("hidden_nav");
  const order = get("nav_order");
  // Unknown names are dropped and pages missing from a saved order keep their default
  // place after it, so a page added to the site later still shows up.
  const ordered = Array.isArray(order) ? [...new Set(order.filter((x) => NAV.includes(x)))] : [];
  return {
    built: now,
    navOrder: [...ordered, ...NAV.filter((x) => !ordered.includes(x))],
    hiddenNav: Array.isArray(hidden) ? hidden.filter((x) => HIDEABLE_NAV.includes(x)) : [],
    statusStrip: get("status_strip") === "everyone" ? "everyone" : "admins",
  };
}

// data/companies/admin.json: what this build applied, for the Admin page and the
// weekly registry run. Only public fields.
export function adminSummary({ base, result, overlay, now = new Date().toISOString() }) {
  return {
    built: now,
    from: overlay?.from ?? "none",
    manifest: { version: base.version, repoStatus: base.status, status: result.manifest.status, approvedBy: result.manifest.approvedBy, approvedOn: result.manifest.approvedOn, repoCompanies: base.companies.length, companies: result.manifest.companies.length },
    applied: result.applied,
    problems: result.problems,
    regions: [...new Set(base.companies.map((c) => c.region))].sort(),
    types: [...new Set(base.companies.flatMap((c) => c.types))].sort(),
    // The editable fields of every company as the site now has them, so the Admin page
    // can fill its form and show what each change does.
    companies: result.manifest.companies.map((c) => ({ id: c.id, ...Object.fromEntries(EDITABLE.filter((f) => c[f] !== undefined).map((f) => [f, c[f]])), ...(c.added && { added: true }), ...(c.edited && { edited: true }) })),
    hidden: result.applied.hidden.map((id) => ({ id, name: base.companies.find((c) => c.id === id)?.name ?? id })),
    overlay: overlay ? { fetched: overlay.fetched, approvals: overlay.approvals, overrides: overlay.overrides, settings: overlay.settings ?? [] } : null,
  };
}
