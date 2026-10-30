// Search and filtering for the Company Explorer (companies.html, company.html), kept
// free of the page so it can be tested. Followed companies live in this browser only.

export const LANES = [
  { id: "direct", label: "Direct", text: "Names an authorisation number or a brand the company holds" },
  { id: "substance", label: "Substance", text: "Names an active substance the company holds a sourced product for" },
  { id: "class", label: "Class", text: "Names a drug class the company holds products in (indirect)" },
  { id: "corporate", label: "Company news", text: "Names the company, with no product link found" },
];
export const laneLabel = (id) => LANES.find((l) => l.id === id)?.label ?? id;

export const COVERAGE = {
  mapped: "Products mapped (US and EU)",
  partial: "Partly mapped",
  "not-mapped": "Products not yet mapped",
};

export const TYPE_LABELS = {
  innovator: "Innovator",
  biotech: "Biotechnology",
  biologics: "Biologics",
  generics: "Generics",
  biosimilars: "Biosimilars",
  vaccines: "Vaccines",
  plasma: "Plasma products",
  specialty: "Specialty",
  regional: "Regional manufacturer",
  injectables: "Injectables",
  consumer: "Consumer health",
  "rare disease": "Rare disease",
  API: "Active ingredients (API)",
  distribution: "Distribution",
};

export const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Edit distance, capped: enough to forgive one or two typos in a company name.
function near(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// The names a company can be found by, each with how it should be described in results.
export function namesOf(c) {
  return [
    { text: c.name, how: null },
    ...(c.legal && c.legal !== c.name ? [{ text: c.legal, how: "legal name" }] : []),
    ...(c.aliases ?? []).map((a) => ({ text: a, how: "also known as" })),
    ...(c.former ?? []).map((a) => ({ text: a, how: "former name" })),
  ];
}

// Companies for a query of two or more characters: exact names first, then names that
// start with the query, then names containing it, then near misses. A short ambiguous
// term ("Merck") returns its candidates and a note instead of picking one.
export function searchCompanies(index, q, limit = 12) {
  const nq = norm(q);
  if (nq.length < 2) return { results: [], ambiguous: null };
  const amb = (index.ambiguous ?? []).find((a) => norm(a.term) === nq);
  const scored = [];
  for (const c of index.companies) {
    let best = null;
    for (const n of namesOf(c)) {
      const t = norm(n.text);
      if (!t) continue;
      let score = null;
      if (t === nq) score = 0;
      else if (t.startsWith(nq)) score = 1;
      else if (t.split(" ").some((w, i, ws) => ws.slice(i).join(" ").startsWith(nq))) score = 2;
      else if (nq.length >= 4 && t.includes(nq)) score = 3;
      else if (nq.length >= 5 && t.split(" ").some((w) => near(w, nq, nq.length >= 8 ? 2 : 1))) score = 4;
      if (score != null && (!best || score < best.score || (score === best.score && !n.how && best.how))) best = { score, via: n };
    }
    if (best) scored.push({ company: c, score: best.score, via: best.via.how ? `${best.via.how}: ${best.via.text}` : null });
  }
  scored.sort((a, b) => a.score - b.score || a.company.name.localeCompare(b.company.name));
  const ambiguous = amb ? { ...amb, candidates: amb.candidates.map((id) => index.companies.find((c) => c.id === id)).filter(Boolean) } : null;
  return { results: scored.slice(0, limit), ambiguous };
}

// Products and substances (from products.json) whose name starts with the query, or has
// a word that does. Each lists the companies with a sourced relationship and its markets.
export function searchProducts(products, q, limit = 15) {
  const nq = norm(q);
  if (nq.length < 3 || !products) return [];
  const out = [];
  for (const t of products.terms) {
    const n = norm(t.n);
    const score = n === nq ? 0 : n.startsWith(nq) ? 1 : n.split(" ").some((w) => w.startsWith(nq)) ? 2 : null;
    if (score != null) out.push({ ...t, score });
  }
  return out.sort((a, b) => a.score - b.score || (a.k === "s" ? -1 : 1) - (b.k === "s" ? -1 : 1) || a.n.localeCompare(b.n)).slice(0, limit);
}

export function browse(index, { region = "", type = "" } = {}) {
  return index.companies.filter((c) => (!region || c.region === region) && (!type || (c.types ?? []).includes(type))).sort((a, b) => a.name.localeCompare(b.name));
}

// Filters for a company's related updates or research.
//   lanes: which lanes to include; market: "US", "EU", "outside" or "";
//   days: only items published in the last N days; topic: update category; official: "1" or "".
export function filterRelated(list, { lanes = ["direct", "substance", "class"], market = "", days = "", topic = "", official = "" } = {}, now = Date.now()) {
  return list.filter((x) => {
    if (!lanes.includes(x.lane)) return false;
    if (market === "outside" && !x.outside) return false;
    if ((market === "US" || market === "EU") && (x.outside || !marketMatches(x, market))) return false;
    if (days && x.published && now - Date.parse(x.published) > Number(days) * 86400000) return false;
    if (topic && x.category !== topic) return false;
    if (official === "1" && !x.official) return false;
    return true;
  });
}

const EU = new Set(["EU", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);
function marketMatches(x, market) {
  if (!x.country) return true;
  return market === "US" ? x.country === "US" : EU.has(x.country);
}

// Why the list is empty, so "nothing found" is never mistaken for "nothing to worry about".
export function emptyReason({ all, shown, coverage, sources }) {
  if (shown.length) return null;
  if (all.length) return { kind: "filtered", text: `${all.length} related item${all.length > 1 ? "s are" : " is"} hidden by the current filters.` };
  const down = (sources ?? []).filter((s) => !s.ok);
  if (down.length) return { kind: "outage", text: `A registry source is failing (${down.map((s) => s.name).join(", ")}), so some relationships may be missing.` };
  if (coverage?.status === "not-mapped") return { kind: "unmapped", text: "This company's products are not mapped yet, so only updates naming the company can match. Turn on company news to see them." };
  return { kind: "none", text: "No related public items in the current data." };
}

// ---- Followed companies (this browser only) ----

const KEY = "pv-companies";
export function loadFollowed(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function saveFollowed(list, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify([...new Set(list)]));
  } catch {}
}
export function toggleFollowed(id, storage = globalThis.localStorage) {
  const list = loadFollowed(storage);
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  saveFollowed(next, storage);
  return next.includes(id);
}

// Updates (with `co` from the build) that relate to followed companies through a product lane.
export function followedUpdates(updates, followed, limit = 10) {
  const set = new Set(followed);
  return updates
    .map((u) => ({ u, hits: (u.co ?? []).filter((m) => set.has(m.id) && m.lane !== "corporate") }))
    .filter((x) => x.hits.length)
    .slice(0, limit);
}
