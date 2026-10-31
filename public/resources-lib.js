// Public Safety Data Resources: the vocabulary, checks, search and guide shared by the
// directory page (resources.html), its admin page (admin-resources.html), the build
// (scripts/resources.mjs) and the database import (scripts/resources-sql.mjs).
//
// A resource is a reference destination: a database, register or publication list a
// PV professional can open. It is not a collection source. Listing a resource never
// makes the build collect from it; that only happens through a source in Admin → Data
// sources (data_sources), which needs its own test and activation. A resource may point
// at such a source (sourceId) so readers can see that PV Info already collects from it.

export const CATEGORIES = [
  { id: "adverse_events", label: "Adverse-event reporting databases", short: "Adverse events" },
  { id: "safety_comms", label: "Regulatory safety communications and recalls", short: "Safety communications" },
  { id: "labels", label: "Product labels and reference information", short: "Labels and reference" },
  { id: "trials", label: "Clinical trial results and safety information", short: "Clinical trials" },
  { id: "literature", label: "Research and literature", short: "Research and literature" },
  { id: "specialist", label: "Specialist resources", short: "Specialist" },
];

export const SPECIALTIES = [
  { id: "vaccines", label: "Vaccines" },
  { id: "pregnancy", label: "Pregnancy and lactation" },
  { id: "med_errors", label: "Medication errors" },
  { id: "devices", label: "Medical devices" },
];

export const PRODUCTS = [
  { id: "medicine", label: "Medicines" },
  { id: "vaccine", label: "Vaccines" },
  { id: "device", label: "Medical devices" },
];

// Who can get in. Separate from whether files can be downloaded and whether the data
// may be reused: a site can be open to read and still forbid reuse.
export const PUBLIC_ACCESS = [
  { id: "open", label: "Open to everyone" },
  { id: "registration", label: "Free registration" },
  { id: "partial", label: "Partly public" },
  { id: "restricted", label: "Restricted (application or fee)" },
];
export const DOWNLOAD = [
  { id: "yes", label: "Downloadable files" },
  { id: "partial", label: "Limited downloads" },
  { id: "no", label: "No downloads" },
  { id: "unknown", label: "Downloads not confirmed" },
];
export const API = [
  { id: "open", label: "Open API" },
  { id: "key", label: "API with key or request" },
  { id: "no", label: "No API" },
  { id: "unknown", label: "API not confirmed" },
];
export const REUSE = [
  { id: "open", label: "Open licence" },
  { id: "conditions", label: "Reuse with conditions" },
  { id: "permission", label: "Permission needed" },
  { id: "unknown", label: "Reuse terms not stated" },
];
export const STATUSES = [
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "retired", label: "Retired" },
];
export const LINK_STATUS = [
  { id: "ok", label: "Link works" },
  { id: "broken", label: "Link flagged broken" },
];
export const VERIFY_METHODS = [
  { id: "editor", label: "Checked by a PV Info editor" },
  { id: "automated", label: "Checked by an automated page read, awaiting editor review" },
];

// Access filters on the directory page. "data" is the "data for analysis" guide question.
export const ACCESS_FILTERS = [
  { id: "open", label: "Open to everyone", test: (r) => r.access.publicAccess === "open" },
  { id: "registration", label: "Free registration", test: (r) => r.access.publicAccess === "registration" },
  { id: "restricted", label: "Partly public or restricted", test: (r) => ["partial", "restricted"].includes(r.access.publicAccess) },
  { id: "search", label: "Public search", test: (r) => r.access.search },
];
export const DATA_FILTERS = [
  { id: "data", label: "Downloads or API", test: (r) => hasDownload(r) || hasApi(r) },
  { id: "download", label: "Downloadable files", test: (r) => hasDownload(r) },
  { id: "api", label: "API", test: (r) => hasApi(r) },
];
export const hasDownload = (r) => ["yes", "partial"].includes(r.access.download);
export const hasApi = (r) => ["open", "key"].includes(r.access.api);

export const label = (list, id) => list.find((x) => x.id === id)?.label ?? id;

// A resource is due for review a year after it was last verified.
export const REVIEW_MONTHS = 12;
export function reviewDue(r, now = Date.now()) {
  if (!r.verified?.on) return true;
  return now - Date.parse(`${r.verified.on}T00:00:00Z`) > REVIEW_MONTHS * 30.5 * 86400000;
}

export const COVERAGE_STATEMENT =
  "Public Safety Data Resources is a curated selection of publicly accessible resources that PV professionals commonly use. It does not list every safety database. " +
  "Each entry links to the official resource and records who maintains it, what it covers, how it can be accessed, its known limitations and when an editor last checked it. " +
  "Public access, downloadable data and permission to reuse data are recorded separately: a resource you can read may still restrict reuse, so check its terms before using data. " +
  "Listing a resource does not mean PV Info collects from it; resources marked as collected are also sources of PV Info's updates.";

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COUNTRY = /^[A-Z]{2,3}$/;
const ids = (list) => new Set(list.map((x) => x.id));
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v, allowed) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter((x) => allowed.has(x)))];

export function urlProblem(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return "The official link is not a web address.";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "The official link must start with https://.";
  if (u.username || u.password) return "Do not put a user name or password in a link.";
  return null;
}

// Tidies a resource as typed (by an admin, or in resources.json) and names its problems,
// the same way the database does (supabase/schema.sql, admin_save_resource).
export function cleanResource(raw = {}) {
  const problems = [];
  const r = {
    id: text(raw.id, 60),
    name: text(raw.name, 160),
    organization: text(raw.organization, 200),
    categories: list(raw.categories, ids(CATEGORIES)),
    specialties: list(raw.specialties, ids(SPECIALTIES)),
    countries: [...new Set((Array.isArray(raw.countries) ? raw.countries : []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))],
    products: list(raw.products, ids(PRODUCTS)),
    purpose: text(raw.purpose, 400),
    coverage: {
      countries: text(raw.coverage?.countries, 300),
      products: text(raw.coverage?.products, 300),
      reportTypes: text(raw.coverage?.reportTypes, 400),
      years: text(raw.coverage?.years, 200),
    },
    access: {
      publicAccess: raw.access?.publicAccess,
      search: Boolean(raw.access?.search),
      download: raw.access?.download ?? "unknown",
      api: raw.access?.api ?? "unknown",
      note: text(raw.access?.note, 600),
    },
    reuse: { status: raw.reuse?.status ?? "unknown", note: text(raw.reuse?.note, 400) },
    limitations: text(raw.limitations, 800),
    url: text(raw.url, 2000),
    links: (Array.isArray(raw.links) ? raw.links : []).map((l) => ({ label: text(l?.label, 80), url: text(l?.url, 2000) })).filter((l) => l.label || l.url).slice(0, 6),
    sourceId: raw.sourceId ? text(raw.sourceId, 60) : null,
    keywords: [...new Set((Array.isArray(raw.keywords) ? raw.keywords : []).map((k) => text(k, 60)).filter(Boolean))].slice(0, 20),
    status: raw.status ?? "draft",
  };
  if (!ID.test(r.id)) problems.push("The id must be lower-case letters, numbers and dashes.");
  if (r.name.length < 2) problems.push("Enter the resource's name.");
  if (!r.organization) problems.push("Enter the organization that maintains it.");
  if (!r.categories.length) problems.push("Choose at least one category.");
  if (r.categories.includes("specialist") && !r.specialties.length) problems.push("Choose the specialist area.");
  if (!r.countries.length || r.countries.some((c) => !COUNTRY.test(c))) problems.push("Countries must be codes such as US, EU or INT (international).");
  if (!r.products.length) problems.push("Choose the product types it covers.");
  if (!r.purpose) problems.push("Say what question it helps answer.");
  if (!r.limitations) problems.push("Record its known limitations (or say none are stated).");
  if (!ids(PUBLIC_ACCESS).has(r.access.publicAccess)) problems.push("Choose who can access it.");
  if (!ids(DOWNLOAD).has(r.access.download)) problems.push("Choose whether files can be downloaded.");
  if (!ids(API).has(r.access.api)) problems.push("Choose whether there is an API.");
  if (!ids(REUSE).has(r.reuse.status)) problems.push("Choose the reuse terms.");
  if (!ids(STATUSES).has(r.status)) problems.push("Unknown status.");
  const bad = urlProblem(r.url);
  if (bad) problems.push(bad);
  for (const l of r.links) if (!l.label || urlProblem(l.url)) problems.push(`The extra link "${l.label || l.url}" needs a label and a web address.`);
  if (r.sourceId && !ID.test(r.sourceId)) problems.push("The linked data source id is not valid.");
  if (r.status === "published" && !raw.verified?.on) problems.push("A resource is published only after it has been verified.");
  return { resource: r, problems };
}

// A safety_resources row (supabase/schema.sql) in the shape of resources.json.
export const fromRow = (r) => ({
  id: r.id, name: r.name, organization: r.organization, categories: r.categories, specialties: r.specialties, countries: r.countries,
  products: r.products, purpose: r.purpose, coverage: r.coverage, access: r.access, reuse: r.reuse, limitations: r.limitations,
  url: r.url, links: r.links, sourceId: r.source_id, keywords: r.keywords, status: r.status, linkStatus: r.link_status, linkNote: r.link_note ?? "",
  verified: r.verified_on ? { on: r.verified_on, method: r.verified_method } : null, verifiedBy: r.verified_by ?? null, updatedAt: r.updated_at ?? null,
});

// The directory's public file (data/resources.json): published resources only, with the
// verifier's email left out, and whether PV Info collects from it (an active registry
// source). Collection status comes only from the registry; nothing here changes it.
export function publicResources(rows, { activeSources = new Set(), now = new Date().toISOString() } = {}) {
  const skipped = [];
  const resources = [];
  for (const raw of rows) {
    if (raw.status !== "published") continue;
    const { resource, problems } = cleanResource(raw);
    if (problems.length) {
      skipped.push({ id: raw.id, problem: problems.join(" ") });
      continue;
    }
    const { status, sourceId, ...pub } = resource;
    resources.push({
      ...pub,
      verified: { on: raw.verified.on, method: raw.verified.method === "editor" ? "editor" : "automated" },
      linkStatus: raw.linkStatus === "broken" ? "broken" : "ok",
      collected: Boolean(sourceId && activeSources.has(sourceId)),
    });
  }
  resources.sort((a, b) => CATEGORIES.findIndex((c) => c.id === a.categories[0]) - CATEGORIES.findIndex((c) => c.id === b.categories[0]) || a.name.localeCompare(b.name));
  const count = (key) => Object.fromEntries([...new Set(resources.flatMap((r) => r[key]))].sort().map((k) => [k, resources.filter((r) => r[key].includes(k)).length]));
  return { built: now, coverage: COVERAGE_STATEMENT, total: resources.length, byCategory: count("categories"), byCountry: count("countries"), skipped, resources };
}

// ── Search ──────────────────────────────────────────────────────────────────

// EU and EEA countries: EU-wide resources (EudraVigilance, EMA) also cover them.
const EEA = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO"]);

// Whether a resource covers a country: listed for it, EU-wide for an EEA country, or international.
export function coversCountry(r, code) {
  if (!code) return true;
  return r.countries.includes(code) || (EEA.has(code) && r.countries.includes("EU")) || r.countries.includes("INT");
}
// Listed for the country itself (or the EU for an EEA country), not only through "international".
export const countrySpecific = (r, code) => r.countries.includes(code) || (EEA.has(code) && r.countries.includes("EU"));

// Words that point at a category, specialty, product or data need, longest first.
const PHRASES = [
  ["adverse drug reactions", { category: "adverse_events" }], ["adverse drug reaction", { category: "adverse_events" }],
  ["adverse events", { category: "adverse_events" }], ["adverse event", { category: "adverse_events" }], ["adverse-event", { category: "adverse_events" }],
  ["adverse reactions", { category: "adverse_events" }], ["adverse reaction", { category: "adverse_events" }],
  ["side effects", { category: "adverse_events" }], ["side effect", { category: "adverse_events" }], ["case reports", { category: "adverse_events" }],
  ["spontaneous", { category: "adverse_events" }], ["pharmacovigilance database", { category: "adverse_events" }], ["adr", { category: "adverse_events" }], ["adrs", { category: "adverse_events" }], ["ae", { category: "adverse_events" }],
  ["safety communications", { category: "safety_comms" }], ["safety communication", { category: "safety_comms" }], ["warnings", { category: "safety_comms" }], ["warning", { category: "safety_comms" }],
  ["alerts", { category: "safety_comms" }], ["alert", { category: "safety_comms" }], ["recalls", { category: "safety_comms" }], ["recall", { category: "safety_comms" }],
  ["withdrawals", { category: "safety_comms" }], ["withdrawal", { category: "safety_comms" }], ["dhpc", { category: "safety_comms" }], ["signals", { category: "safety_comms" }], ["signal", { category: "safety_comms" }],
  ["product information", { category: "labels" }], ["prescribing information", { category: "labels" }], ["package insert", { category: "labels" }], ["package inserts", { category: "labels" }],
  ["labels", { category: "labels" }], ["label", { category: "labels" }], ["labeling", { category: "labels" }], ["labelling", { category: "labels" }],
  ["smpc", { category: "labels" }], ["spc", { category: "labels" }], ["leaflet", { category: "labels" }], ["monograph", { category: "labels" }], ["approvals", { category: "labels" }], ["approval", { category: "labels" }],
  ["clinical trials", { category: "trials" }], ["clinical trial", { category: "trials" }], ["trials", { category: "trials" }], ["trial", { category: "trials" }],
  ["literature", { category: "literature" }], ["publications", { category: "literature" }], ["published", { category: "literature" }], ["papers", { category: "literature" }],
  ["articles", { category: "literature" }], ["studies", { category: "literature" }], ["study", { category: "literature" }], ["systematic reviews", { category: "literature" }], ["research", { category: "literature" }],
  ["medication errors", { specialty: "med_errors" }], ["medication error", { specialty: "med_errors" }], ["errors", { specialty: "med_errors" }],
  ["pregnancy", { specialty: "pregnancy" }], ["pregnant", { specialty: "pregnancy" }], ["lactation", { specialty: "pregnancy" }], ["breastfeeding", { specialty: "pregnancy" }],
  ["medical devices", { product: "device" }], ["medical device", { product: "device" }], ["devices", { product: "device" }], ["device", { product: "device" }],
  ["vaccines", { product: "vaccine" }], ["vaccine", { product: "vaccine" }], ["immunisation", { product: "vaccine" }], ["immunization", { product: "vaccine" }],
  ["medicines", { product: "medicine" }], ["medicine", { product: "medicine" }], ["drugs", { product: "medicine" }],
  ["for analysis", { data: "data" }], ["analysis", { data: "data" }], ["analyse", { data: "data" }], ["analyze", { data: "data" }], ["bulk", { data: "download" }],
  ["download", { data: "download" }], ["downloads", { data: "download" }], ["csv", { data: "download" }], ["dataset", { data: "data" }], ["api", { data: "api" }],
].sort((a, b) => b[0].length - a[0].length);
const STOP = new Set("a about an and any are can check current data database databases do explore find for from get give i in information is latest list look me my need obtain of official on or please reported resource resources search show some that the there to us want what where which who with".split(" "));

// Reads a plain question such as "Find adverse-event data for Japan" into filters:
// a country, a category, a specialty, a product type and a data need, plus the words
// left over. `countries` is agencies.json: [{ code, country, terms, agencies: [{ abbr }] }].
export function parseQuery(q, countries = []) {
  const out = { country: "", category: "", specialty: "", product: "", data: "", words: [] };
  let s = ` ${String(q ?? "").toLowerCase().replace(/[“”"?!.,;:()]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (!s.trim()) return out;
  // Countries by name, other terms, then agency abbreviations (PMDA → Japan). Two-letter
  // codes only count when typed in capitals, so "us" in a sentence is not the US.
  const names = [];
  for (const c of countries) {
    if (c.code === "INT") continue;
    for (const n of [c.country, ...(c.terms ?? [])]) if (n && n.length > 2) names.push([n.toLowerCase(), c.code]);
    for (const a of c.agencies ?? []) if (a.abbr && a.abbr.length > 2) names.push([a.abbr.toLowerCase(), c.code]);
  }
  names.push(["usa", "US"], ["america", "US"], ["uk", "GB"], ["britain", "GB"], ["england", "GB"], ["europe", "EU"], ["european", "EU"], ["japanese", "JP"], ["canadian", "CA"], ["australian", "AU"], ["global", "INT"], ["worldwide", "INT"], ["international", "INT"]);
  names.sort((a, b) => b[0].length - a[0].length);
  for (const [n, code] of names) {
    if (s.includes(` ${n} `)) {
      out.country ||= code;
      s = s.replace(` ${n} `, " ");
    }
  }
  if (!out.country) {
    const caps = String(q).match(/\b[A-Z]{2}\b/g) ?? [];
    const code = caps.find((c) => countries.some((x) => x.code === c));
    if (code) {
      out.country = code;
      s = s.replace(` ${code.toLowerCase()} `, " ");
    }
  }
  for (const [p, hit] of PHRASES) {
    if (!s.includes(` ${p} `)) continue;
    for (const [k, v] of Object.entries(hit)) out[k] ||= v;
    s = s.replaceAll(` ${p} `, " ");
  }
  out.words = s.split(" ").filter((w) => w && !STOP.has(w));
  return out;
}

const haystack = (r) => [r.name, r.organization, r.purpose, r.limitations, r.access.note, r.reuse.note, ...Object.values(r.coverage), ...r.keywords, ...r.countries].join(" ").toLowerCase();

// Whether a resource matches the filters (from the page's controls and the parsed search).
// f: { country, category, specialty, product, access, data, words, favorites, favs }
export function matches(r, f) {
  if (f.favorites && !f.favs?.has(r.id)) return false;
  if (f.country && !coversCountry(r, f.country)) return false;
  if (f.category && !r.categories.includes(f.category)) return false;
  if (f.specialty && !r.specialties.includes(f.specialty)) return false;
  if (f.product && !r.products.includes(f.product)) return false;
  if (f.access && !ACCESS_FILTERS.find((a) => a.id === f.access)?.test(r)) return false;
  if (f.data && !DATA_FILTERS.find((a) => a.id === f.data)?.test(r)) return false;
  if (f.words?.length) {
    const h = haystack(r);
    if (!f.words.every((w) => h.includes(w))) return false;
  }
  return true;
}

// Best first: listed for the chosen country before international ones, then by category order and name.
export function rank(list, f) {
  const cat = (r) => CATEGORIES.findIndex((c) => c.id === (f.category && r.categories.includes(f.category) ? f.category : r.categories[0]));
  return [...list].sort((a, b) =>
    (f.country ? Number(countrySpecific(b, f.country)) - Number(countrySpecific(a, f.country)) : 0) || cat(a) - cat(b) || a.name.localeCompare(b.name));
}

// "Which resource should I use?"
export const GUIDE = [
  { id: "events", question: "Where can I explore reported adverse events?", filters: { category: "adverse_events" },
    tip: "These hold spontaneous reports of suspected reactions. A report does not show the product caused the event, and counts cannot tell you how often it happens." },
  { id: "warning", question: "Where can I find an official warning?", filters: { category: "safety_comms" },
    tip: "Authority safety communications, recalls and alerts. Check the issuing country: a warning in one country may not apply in another." },
  { id: "label", question: "Where can I check current product information?", filters: { category: "labels" },
    tip: "Official labels and registers. Labels differ by country and change over time, so check the date on the document." },
  { id: "studies", question: "Where can I find published safety studies?", filters: { category: "literature" },
    tip: "Literature and study databases. Trial results are under Clinical trials." },
  { id: "data", question: "Where can I obtain data for analysis?", filters: { data: "data" },
    tip: "Resources with downloadable files or an API. Being able to download data is not permission to reuse it: read the reuse terms on each card." },
];

// Favorites: { [resource id]: ISO time added }, kept in the reader's workspace
// (localStorage, and synced through the database when signed in).
export function toggleFavorite(ws, id, now = new Date().toISOString()) {
  const favs = { ...(ws.resourceFavs ?? {}) };
  if (favs[id]) delete favs[id];
  else favs[id] = now;
  ws.resourceFavs = favs;
  return Boolean(favs[id]);
}
