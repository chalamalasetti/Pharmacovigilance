// The brains of the "Ask PV Info" chat bubble. No AI and no server: it reads the
// same updates.json and agencies.json the page shows, works out which country,
// topic, time window and words the reader asked about, and answers with the
// matching updates, each linked to its regulator notice or news report. Pure
// functions, so they can be tested.

import { flag } from "./lib.js";

const DAY = 86400000;

const TOPIC_WORDS = {
  safety: ["safety", "alert", "alerts", "signal", "signals", "warning", "warnings", "adverse", "side effect", "side effects", "dhpc", "prac", "boxed warning"],
  recall: ["recall", "recalls", "recalled", "quality", "nitrosamine", "nitrosamines", "withdrawn", "withdrawal", "falsified", "counterfeit", "substandard"],
  label: ["label", "labels", "labelling", "labeling", "smpc", "package insert", "product information", "leaflet"],
  guideline: ["guideline", "guidelines", "guidance", "gvp", "ich", "cioms", "e2b", "q&a"],
  regulation: ["regulation", "regulations", "regulatory", "regulatory change", "regulatory changes", "rule", "rules", "law", "laws", "legislation", "requirement", "requirements", "directive"],
  policy: ["policy", "policies", "consultation", "consultations", "strategy", "reform", "framework"],
  inspection: ["inspection", "inspections", "warning letter", "warning letters", "enforcement", "483", "audit", "penalty"],
  approval: ["approval", "approvals", "approved", "authorisation", "authorization", "authorised", "authorized"],
};

const REGION_WORDS = {
  International: ["international", "global", "worldwide"],
  Americas: ["americas", "america", "latin america", "south america", "north america", "latam"],
  Europe: ["europe", "european"],
  "Asia-Pacific": ["asia", "asian", "apac", "asia pacific", "pacific"],
  "Middle East & Africa": ["middle east", "africa", "african", "mena", "gulf"],
};

const TIME_WORDS = [
  { words: ["today", "todays"], days: 1, label: "today" },
  { words: ["yesterday"], days: 2, label: "since yesterday" },
  { words: ["this week", "past week", "last week", "7 days", "weekly", "week"], days: 7, label: "this week" },
  { words: ["this month", "past month", "last month", "30 days", "month"], days: 30, label: "this month" },
];

// Names too common as ordinary words to count unless typed in capitals.
const CASE_SENSITIVE = new Set(["us", "who", "hc", "isp", "eda", "ppb", "dav", "ema", "tga", "hsa", "mpa"]);

// Chat filler that says nothing about the topic.
const FILLER = new Set(
  "a an the and or of in on at to for from by with about any anything something new news latest recent recently update updates updated what whats what's which who's is are was were be been there here show me tell give find list get see all some please pls can could would you i we our my do does did has have had happen happening going on from by into over under than this that these those it its any new more most top key important major big biggest main let lets know need want look looking search me hi hey hello thanks thank ok okay country countries region regions agency agencies regulator regulators official officially news story stories drug drugs medicine medicines pv pharmacovigilance".split(" "),
);

const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = (s) => fold(s).replace(/[^\p{L}\p{N}&]+/gu, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (hay, phrase) => new RegExp(`(^| )${escapeRe(phrase)}( |$)`).test(hay);

export function buildIndex(data, agencies) {
  const names = [];
  for (const c of agencies ?? []) {
    const list = [c.country, ...c.terms, ...c.agencies.flatMap((a) => [a.abbr, ...a.aliases])];
    for (const n of new Set(list)) {
      if (!n || ["global", "worldwide", "international"].includes(n.toLowerCase())) continue;
      names.push({ code: c.code, name: n, key: words(n), exact: CASE_SENSITIVE.has(n.toLowerCase()) });
    }
  }
  // Longest first, so "FDA Philippines" wins over "FDA".
  names.sort((a, b) => b.key.length - a.key.length);
  const countries = new Map((data?.countries ?? agencies ?? []).map((c) => [c.code, c]));
  const labels = new Map((data?.categories ?? []).map((c) => [c.id, c.label]));
  return { updates: data?.updates ?? [], names, countries, labels, updated: data?.updated ?? null };
}

// Reads the question into filters: country, region, topic, time window, official-only, and leftover words.
export function parse(q, idx) {
  let hay = ` ${words(q)} `;
  const raw = ` ${String(q)} `;
  const take = (phrase) => {
    hay = hay.replace(new RegExp(`(^| )${escapeRe(phrase)}(?= |$)`, "g"), " ");
  };
  const f = { country: null, region: null, cat: null, days: null, timeLabel: null, official: false, terms: [] };

  for (const n of idx.names) {
    if (!n.key || !has(hay, n.key)) continue;
    if (n.exact && !new RegExp(`(^|[^\\p{L}])${escapeRe(n.name)}(?=[^\\p{L}]|$)`, "u").test(raw)) continue;
    f.country = n.code;
    // "EMA PRAC" names one place twice; drop every name of it.
    for (const m of idx.names) if (m.code === n.code && m.key) take(m.key);
    break;
  }
  if (!f.country) {
    for (const [region, list] of Object.entries(REGION_WORDS)) {
      const hit = list.find((w) => has(hay, w));
      if (hit) {
        f.region = region;
        take(hit);
        break;
      }
    }
  }
  for (const [cat, list] of Object.entries(TOPIC_WORDS)) {
    const sorted = [...list].sort((a, b) => b.length - a.length);
    if (sorted.some((w) => has(hay, w))) {
      f.cat = cat;
      sorted.forEach(take);
      break;
    }
  }
  for (const t of TIME_WORDS) {
    const hit = t.words.find((w) => has(hay, w));
    if (hit) {
      f.days = t.days;
      f.timeLabel = t.label;
      take(hit);
      break;
    }
  }
  if (/(^| )(official|officially|regulators?|agency notices?)( |$)/.test(hay)) f.official = true;
  f.terms = hay
    .split(" ")
    .filter((w) => w.length > 1 && !FILLER.has(w) && !/^\d$/.test(w));
  return f;
}

export function filterUpdates(updates, f, now = Date.now()) {
  return updates.filter((u) => {
    if (f.country && u.country !== f.country) return false;
    if (f.region && u.region !== f.region) return false;
    if (f.cat && !u.tags.includes(f.cat)) return false;
    if (f.official && u.kind !== "official") return false;
    if (f.days && u.published && now - Date.parse(u.published) > f.days * DAY) return false;
    if (f.terms.length) {
      const hay = fold(`${u.title} ${u.summary ?? ""} ${u.source} ${u.agency ?? ""}`);
      if (!f.terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

const ago = (iso, now) => {
  if (!iso) return "";
  const hours = Math.round((now - Date.parse(iso)) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export function card(u, idx, now = Date.now()) {
  const where = idx.countries.get(u.country)?.country ?? u.country;
  return {
    title: u.title,
    link: u.link,
    meta: `${flag(u.country)} ${where} · ${idx.labels.get(u.category) ?? u.category}${u.kind === "official" ? " · Official" : ""}`,
    lines: u.summary ? [{ text: u.summary.length > 180 ? `${u.summary.slice(0, 177)}…` : u.summary }] : [],
    source: `${u.source}${u.published ? ` · ${ago(u.published, now)}` : ""}`,
  };
}

// The link to the same filters on the main page, so "see all" lands on the full list.
export function pageLink(f) {
  const p = new URLSearchParams();
  if (f.country) p.set("country", f.country);
  if (f.region) p.set("region", f.region);
  if (f.cat) p.set("cat", f.cat);
  if (f.official) p.set("kind", "official");
  if (f.terms.length) p.set("q", f.terms.join(" "));
  p.set("days", f.days && f.days <= 7 ? "7" : f.days && f.days <= 30 ? "30" : "60");
  return `./?${p}`;
}

function describe(f, idx) {
  const parts = [];
  if (f.official) parts.push("official");
  parts.push(f.cat ? (idx.labels.get(f.cat) ?? f.cat).toLowerCase() : "updates");
  if (f.terms.length) parts.push(`mentioning “${f.terms.join(" ")}”`);
  if (f.country) parts.push(`for ${flag(f.country)} ${idx.countries.get(f.country)?.country ?? f.country}`);
  if (f.region) parts.push(`in ${f.region}`);
  if (f.timeLabel) parts.push(f.timeLabel);
  return parts.join(" ");
}

const STARTERS = ["🚨 Latest safety alerts", "🇺🇸 FDA this week", "🇪🇺 EMA PRAC updates", "🇮🇳 What's new in India?", "📘 New guidelines", "♻️ Recalls this month"];

function followUps(f, idx) {
  const out = [];
  const name = f.country ? idx.countries.get(f.country)?.country : null;
  if (name) {
    for (const cat of ["safety", "guideline", "regulation", "recall"]) if (cat !== f.cat) out.push(`${name} ${idx.labels.get(cat)?.split(" ")[0].toLowerCase() ?? cat}`);
  } else if (f.cat) {
    out.push(`${idx.labels.get(f.cat)?.split(" ")[0] ?? f.cat} in Europe`, `${idx.labels.get(f.cat)?.split(" ")[0] ?? f.cat} in Asia`, `${idx.labels.get(f.cat)?.split(" ")[0] ?? f.cat} today`);
  }
  return [...out, ...STARTERS.filter((s) => !out.includes(s))].slice(0, 5);
}

function overview(idx, now) {
  const week = idx.updates.filter((u) => u.published && now - Date.parse(u.published) < 7 * DAY);
  const byCat = new Map();
  for (const u of week) byCat.set(u.category, (byCat.get(u.category) ?? 0) + 1);
  const byCountry = new Map();
  for (const u of week) byCountry.set(u.country, (byCountry.get(u.country) ?? 0) + 1);
  const topCats = [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${n} ${(idx.labels.get(c) ?? c).toLowerCase()}`);
  const topCountries = [...byCountry].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => `${flag(c)} ${idx.countries.get(c)?.country ?? c} (${n})`);
  return `This week: ${week.length} updates from ${byCountry.size} countries and bodies. Biggest topics: ${topCats.join(", ") || "none yet"}. Busiest: ${topCountries.join(", ") || "none yet"}.`;
}

const HELP =
  "Ask me about a country, agency, topic or drug, and I'll pull the matching updates with links to the source. For example: “FDA safety alerts this week”, “PMDA label changes”, “nitrosamine recalls”, “EMA guidelines”, “What's new in Brazil?” or “summary”.";

export function reply(q, idx, { now = Date.now(), max = 5 } = {}) {
  const text = words(q);
  if (!text || /^(hi|hey|hello|help|start|menu|what can you do|how does this work)( .*)?$/.test(text)) {
    return { text: HELP, cards: [], chips: STARTERS, more: null };
  }
  if (/(^| )(summary|overview|stats|statistics|recap|digest)( |$)/.test(text)) {
    return { text: overview(idx, now), cards: [], chips: STARTERS, more: { href: "./?days=7", label: "See this week's updates →" } };
  }
  const f = parse(q, idx);
  let found = filterUpdates(idx.updates, f, now);
  let note = "";
  // Nothing in a short window: widen to everything on file before giving up.
  if (!found.length && f.days) {
    const wider = filterUpdates(idx.updates, { ...f, days: null, timeLabel: null }, now);
    if (wider.length) {
      note = `Nothing ${f.timeLabel}, but here are the most recent. `;
      f.days = null;
      f.timeLabel = null;
      found = wider;
    }
  }
  if (!found.length) {
    return {
      text: `I couldn't find any ${describe(f, idx)} in the last 60 days. Try fewer words, another country, or a broader topic.`,
      cards: [],
      chips: followUps({ ...f, terms: [] }, idx),
      more: null,
    };
  }
  const sorted = [...found].sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "") || b.priority - a.priority);
  const shown = sorted.slice(0, max);
  const count = found.length === 1 ? "1 update" : `${found.length} updates`;
  return {
    text: `${note}${count}: ${describe(f, idx)}.${found.length > max ? ` Here are the ${max} newest.` : ""}`,
    cards: shown.map((u) => card(u, idx, now)),
    chips: followUps(f, idx),
    more: found.length > max ? { href: pageLink(f), label: `See all ${found.length} on the page →` } : null,
  };
}

