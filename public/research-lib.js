// Pure helpers for the Research & Innovation pages (research.js, paper.js) and the tests:
// labels, filtering, the reader's research watchlist, and citation export.

export const TYPES = [
  { id: "article", label: "Journal article" },
  { id: "review", label: "Review" },
  { id: "preprint", label: "Preprint" },
  { id: "conference", label: "Conference abstract" },
  { id: "commentary", label: "Commentary" },
  { id: "notice", label: "Correction or retraction notice" },
];
export const typeLabel = (id) => TYPES.find((t) => t.id === id)?.label ?? id;
export const reviewLabel = (p) => (p.peerReview === "preprint" ? "Preprint: not peer reviewed" : "Published in a journal");

export const STATUS_LABEL = { retracted: "Retracted", corrected: "Correction published", concern: "Expression of concern" };

export const LENSES = [
  { id: "business", label: "Business", order: ["business", "question", "findings", "limitations", "technical", "approach", "explore"] },
  { id: "scientific", label: "Scientific", order: ["question", "approach", "findings", "limitations", "business", "technical", "explore"] },
  { id: "technical", label: "Technical", order: ["technical", "approach", "findings", "limitations", "question", "business", "explore"] },
  { id: "leadership", label: "Leadership", order: ["business", "findings", "limitations", "question", "technical", "approach", "explore"] },
];

export function authorLine(p, n = 3) {
  const a = p.authors ?? [];
  if (!a.length) return "Authors not listed";
  return a.length > n ? `${a.slice(0, n).join(", ")} et al.` : a.join(", ");
}

// Preprints whose journal version is also here are folded into that version.
export const hasJournalVersion = (p) => p.type === "preprint" && (p.family ?? []).some((f) => f.relation === "published as");

const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function matchesPaper(p, f, now = Date.now()) {
  if (f.app && !p.tags.applications.some((t) => t.id === f.app)) return false;
  if (f.method && !p.tags.methods.some((t) => t.id === f.method)) return false;
  if (f.type && p.type !== f.type) return false;
  if (!f.type && !f.versions && hasJournalVersion(p)) return false;
  if (f.oa && !p.openAccess) return false;
  if (f.maturity && p.maturity?.id !== f.maturity) return false;
  if (f.days && p.published && now - Date.parse(p.published) > Number(f.days) * 86400000) return false;
  if (f.since && !(p.firstSeen > f.since)) return false;
  if (f.ids && !f.ids.includes(p.id)) return false;
  if (f.author && !(p.authors ?? []).some((a) => fold(a) === fold(f.author))) return false;
  if (f.q) {
    const hay = fold(`${p.title} ${(p.authors ?? []).join(" ")} ${p.venue ?? ""} ${(p.keywords ?? []).join(" ")} ${p.summary.map((s) => s.text).join(" ")} ${p.ids?.doi ?? ""} ${p.ids?.pmid ?? ""}`);
    if (!fold(f.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

// ---- The reader's watchlist (this browser only) ----

const KEY = "pv-research";
const VERSION = 1;
export const emptyWatch = () => ({ version: VERSION, saved: {}, topics: [], authors: [], searches: [], lens: "scientific", lastVisit: null, prevVisit: null });

export function loadWatch(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(KEY) || "null");
    if (s && s.version === VERSION) return { ...emptyWatch(), ...s };
  } catch {}
  return emptyWatch();
}

export function saveWatch(w, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(w));
  } catch {}
}

// Starts a visit: remembers when the previous one was, so "new since your last
// visit" stays stable while the reader moves between pages. A visit ends after an hour away.
export function startVisit(w, now = new Date().toISOString()) {
  if (!w.lastVisit || Date.parse(now) - Date.parse(w.lastVisit) > 3600000) w.prevVisit = w.lastVisit;
  w.lastVisit = now;
  return w;
}

export const snapshot = (p) => ({ id: p.id, title: p.title, authors: (p.authors ?? []).slice(0, 6), venue: p.venue, published: p.published, type: p.type, links: p.links, ids: p.ids });

export function toggleSaved(w, p, now = new Date().toISOString()) {
  if (w.saved[p.id]) delete w.saved[p.id];
  else w.saved[p.id] = { at: now, note: "", paper: snapshot(p) };
  return Boolean(w.saved[p.id]);
}

export function setNote(w, p, note, now = new Date().toISOString()) {
  if (!w.saved[p.id]) w.saved[p.id] = { at: now, note: "", paper: snapshot(p) };
  w.saved[p.id].note = note;
  w.saved[p.id].noteAt = now;
}

const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
export const toggleTopic = (w, id) => ((w.topics = toggleIn(w.topics, id)), w.topics.includes(id));
export const toggleAuthor = (w, name) => ((w.authors = toggleIn(w.authors, name)), w.authors.includes(name));

// Papers that match something the reader follows (a topic in either dimension, or an author).
export function followedMatch(w, p) {
  const tags = [...p.tags.applications, ...p.tags.methods].map((t) => t.id);
  return w.topics.some((t) => tags.includes(t)) || (p.authors ?? []).some((a) => w.authors.includes(a));
}

export const isNew = (w, p) => Boolean(w.prevVisit && p.firstSeen > w.prevVisit);

// ---- Citations ----

const risType = { article: "JOUR", review: "JOUR", preprint: "JOUR", conference: "CONF", commentary: "JOUR", notice: "JOUR" };

// RIS, which EndNote, Zotero, Mendeley and most reference managers import.
export function ris(papers) {
  return (
    papers
      .map((p) => {
        const lines = [`TY  - ${risType[p.type] ?? "GEN"}`, `TI  - ${p.title}`];
        for (const a of p.authors ?? []) lines.push(`AU  - ${a}`);
        if (p.venue) lines.push(`${p.type === "conference" ? "T2" : "JO"}  - ${p.venue}`);
        if (p.published) lines.push(`PY  - ${p.published.slice(0, 4)}`, `DA  - ${p.published.replace(/-/g, "/")}`);
        if (p.ids?.doi) lines.push(`DO  - ${p.ids.doi}`);
        if (p.ids?.pmid) lines.push(`AN  - PMID:${p.ids.pmid}`);
        const url = p.links?.doi ?? p.links?.pubmed ?? p.links?.europepmc;
        if (url) lines.push(`UR  - ${url}`);
        if (p.type === "preprint") lines.push("N1  - Preprint: not peer reviewed");
        lines.push("ER  - ");
        return lines.join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}

// One-line citation for copying.
export function citation(p) {
  const year = p.published?.slice(0, 4) ?? "n.d.";
  const where = p.venue ? ` ${p.venue}.` : "";
  const id = p.ids?.doi ? ` doi:${p.ids.doi}` : p.ids?.pmid ? ` PMID: ${p.ids.pmid}` : "";
  return `${authorLine(p, 6)} (${year}). ${p.title}.${where}${p.type === "preprint" ? " [Preprint]" : ""}${id}`;
}

export const primaryLink = (p) => p.links?.doi ?? p.links?.pubmed ?? p.links?.europepmc ?? p.links?.fulltext ?? null;
