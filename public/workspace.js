// The reader's own workspace: their briefing profile and what they have done with
// each update (saved, followed, assessed, assigned, dismissed). PV Info has no
// server or accounts, so this lives in this browser's localStorage; Export and
// Import move it to another browser or a colleague.

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

export function save(ws) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {}
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

// Accepts an exported file. Profile is replaced; item records are merged, newest change winning.
export function importJson(ws, text) {
  const inc = JSON.parse(text);
  if (!inc || inc.version !== VERSION || typeof inc.items !== "object") throw new Error("Not a PV Info workspace file");
  const stamp = (r) => [r.assess?.at, r.assign?.at, r.dismissed?.at, r.savedAt, r.followedAt].filter(Boolean).sort().pop() ?? "";
  for (const [id, rec] of Object.entries(inc.items)) {
    if (!ws.items[id] || stamp(rec) >= stamp(ws.items[id])) ws.items[id] = rec;
  }
  if (inc.profile) {
    ws.profile = { ...ws.profile, ...inc.profile };
    ws.profileSet = true;
  }
  save(ws);
  return ws;
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
export const snapshot = (u) => ({ title: u.title, link: u.link, country: u.country, source: u.source, published: u.published, category: u.category, tags: u.tags, kind: u.kind, agency: u.agency, summary: u.summary, id: u.id, priority: u.priority, region: u.region, retrieved: u.retrieved });
