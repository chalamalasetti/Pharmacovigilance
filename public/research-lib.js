import { withoutPersonalFields } from "./privacy.js";
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

export function authorLine() { return ""; }

// Preprints whose journal version is also here are folded into that version.
export const hasJournalVersion = (p) => p.type === "preprint" && (p.family ?? []).some((f) => f.relation === "published as");

const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function matchesPaper(p, f, now = Date.now()) {
  if (p.excluded && !f.all) return false;
  if (f.app && !p.tags.applications.some((t) => t.id === f.app)) return false;
  if (f.method && !p.tags.methods.some((t) => t.id === f.method)) return false;
  if (f.type && p.type !== f.type) return false;
  if (!f.type && !f.versions && hasJournalVersion(p)) return false;
  if (f.oa && !p.openAccess) return false;
  if (f.maturity && p.maturity?.id !== f.maturity) return false;
  if (f.days && p.published && now - Date.parse(p.published) > Number(f.days) * 86400000) return false;
  if (f.since && !(p.firstSeen > f.since)) return false;
  if (f.ids && !f.ids.includes(p.id)) return false;
  if (f.author) return false; // Legacy author filters are no longer supported.
  if (f.q) {
    const hay = fold(`${p.title} ${p.venue ?? ""} ${(p.keywords ?? []).join(" ")} ${p.summary.map((s) => s.text).join(" ")} ${p.ids?.doi ?? ""} ${p.ids?.pmid ?? ""}`);
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
    if (s && s.version === VERSION) {
      const clean = { ...emptyWatch(), ...withoutPersonalFields(s), authors: [] };
      clean.searches = clean.searches.map((x) => { const p = new URLSearchParams(x.params); p.delete("author"); return { ...x, params: p.toString() }; });
      storage.setItem(KEY, JSON.stringify(clean));
      return clean;
    }
  } catch {}
  return emptyWatch();
}

export function saveWatch(w, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify({ ...withoutPersonalFields(w), authors: [] }));
  } catch {}
}

// Starts a visit: remembers when the previous one was, so "new since your last
// visit" stays stable while the reader moves between pages. A visit ends after an hour away.
export function startVisit(w, now = new Date().toISOString()) {
  if (!w.lastVisit || Date.parse(now) - Date.parse(w.lastVisit) > 3600000) w.prevVisit = w.lastVisit;
  w.lastVisit = now;
  return w;
}

export const snapshot = (p) => ({ id: p.id, title: p.title, venue: p.venue, published: p.published, type: p.type, links: p.links, ids: p.ids });

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
export const toggleAuthor = (w) => { w.authors = []; return false; };

// Papers that match something the reader follows (a topic in either dimension, or an author).
export function followedMatch(w, p) {
  const tags = [...p.tags.applications, ...p.tags.methods].map((t) => t.id);
  return w.topics.some((t) => tags.includes(t));
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
  return `(${year}). ${p.title}.${where}${p.type === "preprint" ? " [Preprint]" : ""}${id}`;
}

export const primaryLink = (p) => p.links?.doi ?? p.links?.pubmed ?? p.links?.europepmc ?? p.links?.fulltext ?? null;

// ---- Editor reviews ----

export const MATURITY_LEVELS = [
  { id: "concept", label: "Concept proposed" },
  { id: "experimental", label: "Experimentally evaluated" },
  { id: "external", label: "Externally evaluated" },
  { id: "operational", label: "Operational evidence reported" },
  { id: "na", label: "Not assessed" },
  { id: "unclear", label: "Not enough information" },
];
export const maturityLabel = (id) => MATURITY_LEVELS.find((m) => m.id === id)?.label ?? id;

// Applies each paper's editor review (from the admin queue) over its automated fields,
// keeping the automated values alongside so the page can show what changed.
export function applyReviews(papers) {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const link = (a, b, relA, relB) => {
    if ((a.family ?? []).some((f) => f.id === b.id)) return;
    (a.family ??= []).push({ id: b.id, relation: relA, how: "an editor's review" });
    (b.family ??= []).push({ id: a.id, relation: relB, how: "an editor's review" });
  };
  for (const p of papers) {
    const r = p.review;
    if (!r) continue;
    if (r.tags) {
      p.autoTags = p.tags;
      const keep = (dim) => r.tags[dim].map((id) => p.tags[dim].find((t) => t.id === id) ?? { id, why: ["set by an editor"] });
      p.tags = { applications: keep("applications"), methods: keep("methods") };
    }
    if (r.summary === "rejected") p.summaryWithdrawn = true;
    if (r.relevance === "weak") p.excluded = true;
    if (r.maturity) {
      p.autoMaturity = p.maturity;
      p.maturity = { id: r.maturity.id, label: maturityLabel(r.maturity.id), reason: r.maturity.reason || "Set by an editor.", reviewed: true };
    }
    if (r.versionOf === "none") {
      for (const f of p.family ?? []) {
        const other = byId.get(f.id);
        if (other) other.family = (other.family ?? []).filter((x) => x.id !== p.id);
      }
      delete p.family;
    } else if (r.versionOf && byId.has(r.versionOf)) {
      const other = byId.get(r.versionOf);
      if (p.type === "preprint") link(p, other, "published as", "preprint");
      else if (other.type === "preprint") link(other, p, "published as", "preprint");
      else link(p, other, "other version", "other version");
    }
  }
  return papers;
}

export const reviewLine = (p) => (p.review ? `Reviewed by an editor${p.review.at ? ` on ${p.review.at.slice(0, 10)}` : ""}` : "Automated, not reviewed");

// ---- Innovation timeline ----

export const EVENT_TYPES = [
  { id: "publication", label: "Research publication" },
  { id: "preprint", label: "Preprint or revision" },
  { id: "dataset", label: "Dataset or benchmark" },
  { id: "implementation", label: "Documented implementation" },
  { id: "guidance", label: "Official guidance" },
];
export const eventLabel = (id) => EVENT_TYPES.find((t) => t.id === id)?.label ?? id;

const DATASET = /\b(datasets?|corpus|corpora|benchmarks?|shared task|reference sets?|gold standard)\b/i;

export function eventType(p) {
  if (p.type === "preprint" || p.type === "notice") return "preprint";
  if (p.maturity?.id === "operational") return "implementation";
  if (p.type !== "review" && DATASET.test(`${p.title} ${(p.keywords ?? []).join(" ")}`)) return "dataset";
  return "publication";
}

// The sentence that best states what a paper adds: a finding, else the conclusion, else the summary.
export function contribution(p) {
  if (p.summaryWithdrawn) return null;
  return p.sections?.findings?.[0] ?? p.sections?.conclusion?.[0] ?? p.summary?.[0] ?? null;
}

const hasTopic = (tags, f) => (!f.app || tags.applications.some((t) => t.id === f.app)) && (!f.method || tags.methods.some((t) => t.id === f.method));

// Dated events for one topic. Every event is a real, dated source: papers by
// publication date (a preprint and its journal version are two events), plus
// regulator guidance on the same topic. Sorted oldest first unless newest is set.
export function timelineEvents(papers, guidance, f, { newest = false, now = Date.now() } = {}) {
  const events = [];
  const pf = { ...f, versions: true, event: undefined };
  for (const p of papers) {
    if (!p.published || !matchesPaper(p, pf, now)) continue;
    const type = eventType(p);
    if (f.event && f.event !== type) continue;
    events.push({ kind: "paper", type, date: p.published, paper: p });
  }
  if (!f.type && !f.oa && !f.maturity && (!f.event || f.event === "guidance")) {
    for (const g of guidance ?? []) {
      if (!g.published || !hasTopic(g.tags, f)) continue;
      if (f.days && now - Date.parse(g.published) > Number(f.days) * 86400000) continue;
      if (f.q && !fold(g.title).includes(fold(f.q))) continue;
      events.push({ kind: "guidance", type: "guidance", date: g.published, guidance: g });
    }
  }
  events.sort((a, b) => (newest ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  return events;
}

// Earlier and later papers on a similar topic (shared vocabulary, not citations).
export function relatedByDate(p, byId) {
  const rel = (p.related ?? []).map((id) => byId.get(id)).filter((q) => q?.published && !q.excluded);
  return { earlier: rel.filter((q) => q.published < p.published), later: rel.filter((q) => q.published >= p.published) };
}

// ---- Admin review queue ----

const GENERIC_PV = /^(adverse (drug )?(events?|reactions?|effects?)|adrs?|drug-induced)$/;

// Which admin-queue tabs a paper belongs to. Applies to papers after applyReviews.
export const REVIEW_QUEUES = [
  { id: "todo", label: "Not reviewed", test: (p) => !p.review },
  { id: "untagged", label: "No PV process tag", test: (p) => !p.tags.applications.length && !p.review?.tags },
  { id: "relevance", label: "Weak PV relevance?", test: (p) => !p.review?.relevance && (p.relevance ?? []).every((w) => GENERIC_PV.test(w)) },
  { id: "summary", label: "Summary not checked", test: (p) => p.hasAbstract && !p.review?.summary },
  { id: "versions", label: "Versions to confirm", test: (p) => !p.review?.versionOf && (p.type === "preprint" || (p.family ?? []).length > 0) },
  { id: "status", label: "Retractions and corrections", test: (p) => (p.status ?? []).length > 0 },
  { id: "reviewed", label: "Reviewed", test: (p) => Boolean(p.review) },
];

// The row an admin's form saves to research_reviews. Unset choices are left out.
export function reviewRow(p, form) {
  const sameTags = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const auto = p.autoTags ?? p.tags;
  const autoApps = auto.applications.map((t) => t.id);
  const autoMethods = auto.methods.map((t) => t.id);
  const tagsChanged = !sameTags(form.applications, autoApps) || !sameTags(form.methods, autoMethods);
  return {
    paper_id: p.id,
    title: p.title,
    tags: tagsChanged || form.confirmTags ? { applications: form.applications, methods: form.methods } : null,
    summary_status: form.summary || null,
    relevance: form.relevance || null,
    maturity: form.maturity ? { id: form.maturity, reason: form.maturityReason || "" } : null,
    version_of: form.versionOf || null,
    note: form.note || null,
  };
}

// A research_reviews row as stored on a paper (the build and the admin page both use it).
export function reviewFromRow(r) {
  return {
    at: r.reviewed_at,
    ...(r.tags && { tags: { applications: r.tags.applications ?? [], methods: r.tags.methods ?? [] } }),
    ...(r.summary_status && { summary: r.summary_status }),
    ...(r.relevance && { relevance: r.relevance }),
    ...(r.maturity?.id && { maturity: { id: r.maturity.id, reason: r.maturity.reason ?? "" } }),
    ...(r.version_of && { versionOf: r.version_of }),
  };
}
