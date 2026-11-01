// The reader's own workspace: their briefing profile and what they have done with
// each update (saved, followed, assessed, assigned, dismissed). It lives in this
// browser's localStorage; Export and Import move it to another browser or a
// colleague, and a signed-in reader's copy is also synced through the database
// (cloud.js), using reconcile() below to combine two devices' changes.

const KEY = "pv-workspace";
const VERSION = 1;

export const ASSESSMENT = [
  { id: "open", label: "Under assessment" },
  { id: "action", label: "Relevant: action needed" },
  { id: "noaction", label: "Relevant: no action" },
  { id: "notrelevant", label: "Not relevant" },
];

export const DISMISS_REASONS = [
  "Not relevant to our products",
  "Not our jurisdiction",
  "Duplicate of another update",
  "Already handled",
  "Informational only",
  "Other",
];

const empty = () => ({ version: VERSION, profile: { role: "", countries: [], topics: [], watch: [] }, items: {}, lastVisit: null });

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.version === VERSION) return { ...empty(), ...s, profile: { ...empty().profile, ...s.profile } };
  } catch {}
  // Countries followed on the main page before the workspace existed.
  const ws = empty();
  try {
    ws.profile.countries = JSON.parse(localStorage.getItem("pv-follow") || "[]");
  } catch {}
  return ws;
}

const saved = new Set();
// Called after every change (cloud.js uses it to push the change to the database).
export const onSave = (fn) => saved.add(fn);

// Writes to this browser without counting as a change (used for synced copies).
export function persist(ws) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {}
}

export function save(ws) {
  ws.changedAt = new Date().toISOString();
  persist(ws);
  for (const fn of saved) fn(ws);
}

export const item = (ws, id) => ws.items[id] ?? {};

// Merges a change into one update's record and saves. A null field removes it.
export function update(ws, id, patch) {
  const next = { ...item(ws, id), ...patch };
  for (const [k, v] of Object.entries(next)) if (v == null || v === false) delete next[k];
  if (Object.keys(next).length) ws.items[id] = next;
  else delete ws.items[id];
  save(ws);
  return next;
}

// Review status shown on the card's evidence line.
export function reviewStatus(rec) {
  if (rec.assess) {
    const label = ASSESSMENT.find((a) => a.id === rec.assess.status)?.label ?? rec.assess.status;
    return `Reviewed by you ${rec.assess.at?.slice(0, 10) ?? ""}: ${label}`;
  }
  return "Automated extraction, not reviewed";
}

export function exportJson(ws) {
  return JSON.stringify({ ...ws, exported: new Date().toISOString() }, null, 2);
}

const stamp = (r) => [r.assess?.at, r.assign?.at, r.dismissed?.at, r.savedAt, r.followedAt].filter(Boolean).sort().pop() ?? "";
const mergeItems = (into, from) => {
  for (const [id, rec] of Object.entries(from)) {
    if (!into[id] || stamp(rec) >= stamp(into[id])) into[id] = rec;
  }
};

// Accepts an exported file. Profile is replaced; item records are merged, newest change winning.
export function importJson(ws, text) {
  const inc = JSON.parse(text);
  if (!inc || inc.version !== VERSION || typeof inc.items !== "object") throw new Error("Not a PV Info workspace file");
  mergeItems(ws.items, inc.items);
  if (inc.groups) ws.groups = inc.groups;
  if (inc.companyPortfolios && typeof inc.companyPortfolios === "object" && !Array.isArray(inc.companyPortfolios)) ws.companyPortfolios = inc.companyPortfolios;
  if (typeof inc.activeCompany === "string") ws.activeCompany = inc.activeCompany;
  if (inc.profile) {
    ws.profile = { ...ws.profile, ...inc.profile };
    ws.profileSet = true;
  }
  save(ws);
  return ws;
}

// Combines this browser's workspace with the synced copy. syncedAt is the synced
// copy's changedAt when this browser last matched it. If only one side changed
// since then it wins outright (so removals stick); if both did, item records are
// merged newest first and the profile, groups and favorite resources come from the later change.
// Returns the workspace to keep and whether the database needs the result.
export function reconcile(local, remote, now = new Date().toISOString()) {
  if (!remote || remote.version !== VERSION) return { ws: local, push: true };
  const since = local.syncedAt ?? "";
  const remoteChanged = (remote.changedAt ?? "") > since;
  const localChanged = (local.changedAt ?? "") > since;
  const lastVisit = [local.lastVisit, remote.lastVisit].filter(Boolean).sort().pop() ?? null;
  if (!remoteChanged) return { ws: local, push: localChanged };
  if (!localChanged) return { ws: { ...empty(), ...remote, lastVisit, syncedAt: remote.changedAt }, push: false };
  const newer = (remote.changedAt ?? "") > (local.changedAt ?? "") ? remote : local;
  const items = { ...local.items };
  mergeItems(items, remote.items ?? {});
  const ws = { ...empty(), ...local, profile: newer.profile, groups: newer.groups, profileSet: local.profileSet || remote.profileSet, team: newer.team, resourceFavs: newer.resourceFavs, companyPortfolios: newer.companyPortfolios, activeCompany: newer.activeCompany, items, lastVisit, changedAt: now };
  if (!ws.groups) delete ws.groups;
  if (!ws.team) delete ws.team;
  if (!ws.resourceFavs) delete ws.resourceFavs;
  return { ws, push: true };
}

// Assessments and assignments as CSV, for a tracker or an audit trail.
export function exportCsv(ws, updates) {
  const byId = new Map(updates.map((u) => [u.id, u]));
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["id", "title", "link", "country", "source", "published", "saved", "followed", "assessment", "assessment note", "assessed at", "assigned to", "due", "assignment note", "dismissed reason", "dismissed note"]];
  for (const [id, r] of Object.entries(ws.items)) {
    const u = byId.get(id) ?? r.snapshot ?? {};
    rows.push([
      id, u.title, u.link, u.country, u.source, u.published?.slice(0, 10),
      r.saved ? "yes" : "", r.followed ? "yes" : "",
      ASSESSMENT.find((a) => a.id === r.assess?.status)?.label, r.assess?.note, r.assess?.at,
      r.assign?.to, r.assign?.due, r.assign?.note,
      r.dismissed?.reason, r.dismissed?.note,
    ]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

// A small copy of the update kept with the record, so saved and assigned work survives
// after the update ages out of the 60-day feed.
export const snapshot = (u) => ({ title: u.title, link: u.link, country: u.country, source: u.source, published: u.published, category: u.category, tags: u.tags, kind: u.kind, agency: u.agency, summary: u.summary, id: u.id, priority: u.priority, region: u.region, retrieved: u.retrieved, ...(u.companyContext && { companyContext: u.companyContext }) });

// Only organizational context crosses the team boundary; ignore unrelated fields.
export function cleanCompanyContext(c) {
  const str = v => String(v ?? "").slice(0,1000);
  return { companyId:str(c.companyId), companyName:str(c.companyName), markets:Array.isArray(c.markets)?c.markets.map(str).slice(0,10):[], products:Array.isArray(c.products)?c.products.slice(0,300).map(p=>({key:str(p.key),brand:str(p.brand),market:str(p.market),authId:str(p.authId),url:/^https?:\/\//.test(p.url??"")?str(p.url):""})):[], lane:str(c.lane), reason:str(c.reason), scopeReason:str(c.scopeReason), outside:c.outside===true, portfolioRevision:Number(c.portfolioRevision)||0, portfolioConfirmedAt:str(c.portfolioConfirmedAt), fingerprint:str(c.fingerprint), sourceItem:str(c.sourceItem), evidenceKind:['paper','requirement'].includes(c.evidenceKind)?c.evidenceKind:'update', sentAt:str(c.sentAt), ...(c.paperId && {paperId:str(c.paperId)}) };
}
