// What each audience sees first in My PV Briefing. Every view is a list of sections,
// and each section picks updates from the briefing by plain rules over the update
// and its impact card. An update appears in the first section that wants it; the
// rest of the reader's scope follows under "More in your scope".

const has = (x, re) => re.test(`${x.u.title} ${x.u.summary ?? ""}`);
const anyKey = (x, keys) => [...x.card.business, ...x.card.technical].some((i) => keys.includes(i.key));
const tagged = (x, tags) => x.u.tags.some((t) => tags.includes(t));

const INTERRUPTION = /\b(outage|downtime|maintenance|unavailab\w*|interrupt\w*|disruption|not available|service (?:issue|incident))\b/i;
const SYSTEMS = /\b(gateway|eudravigilance|faers|portal|esg|submission|system|vigiflow|as2)\b/i;
const TERMINOLOGY = /\b(meddra|whodrug|edqm|terminolog\w*|dictionar\w*|controlled vocabular\w*|idmp|spor|xevmpd|standard terms)\b/i;
const VALIDATION = /\b(e2b|icsr format|validation rules?|business rules?|xml schema|acknowledg\w+ message)\b/i;

// Sections per audience. `pick` sees { u, card, score, hits }.
export const VIEWS = {
  ops: [
    { id: "interruptions", title: "Submission interruptions", hint: "Gateway, portal and database outages or maintenance named by the source.", pick: (x) => has(x, INTERRUPTION) && has(x, SYSTEMS) },
    { id: "reporting", title: "Reporting changes", pick: (x) => anyKey(x, ["reporting", "rules", "icsr"]) },
    { id: "authority", title: "Authority communications", hint: "Official notices from regulators in your scope.", pick: (x) => x.u.kind === "official" && tagged(x, ["regulation", "guideline", "policy", "safety"]) },
    { id: "process", title: "Process implications", pick: (x) => anyKey(x, ["sop", "training"]) },
  ],
  safety: [
    { id: "watch", title: "Watchlist hits", pick: (x) => x.hits.length > 0 },
    { id: "prac", title: "PRAC outcomes", hint: "EMA Pharmacovigilance Risk Assessment Committee: signals, referrals, meeting highlights.", pick: (x) => has(x, /\bPRAC\b|risk assessment committee/i) },
    { id: "comms", title: "Safety communications", pick: (x) => tagged(x, ["safety", "label"]) },
    { id: "quality", title: "Recalls & quality signals", pick: (x) => tagged(x, ["recall"]) },
  ],
  qppv: [
    { id: "regulatory", title: "Regulatory changes", pick: (x) => tagged(x, ["regulation", "guideline"]) },
    { id: "dates", title: "Effective dates & consultations", kind: "dates" },
    { id: "consult", title: "Open consultations", pick: (x) => tagged(x, ["policy"]) || anyKey(x, ["consultation"]) },
    { id: "inspection", title: "Inspection themes", pick: (x) => tagged(x, ["inspection"]) },
    { id: "status", title: "Review status", kind: "status" },
  ],
  systems: [
    { id: "e2b", title: "E2B & validation rules", pick: (x) => has(x, VALIDATION) || anyKey(x, ["icsr"]) },
    { id: "gateway", title: "Gateway notices", pick: (x) => anyKey(x, ["interface"]) || (has(x, INTERRUPTION) && has(x, SYSTEMS)) },
    { id: "terms", title: "Terminology releases", pick: (x) => has(x, TERMINOLOGY) || anyKey(x, ["meddra", "product-data"]) },
    { id: "config", title: "Configuration impact", hint: "Updates with at least one potential technical implication.", pick: (x) => x.card.technical.length > 0 },
  ],
  leader: [
    { id: "glance", title: "This week at a glance", kind: "glance" },
    { id: "major", title: "Major changes", hint: "Official safety, regulatory and guidance notices with the highest priority.", pick: (x) => x.u.kind === "official" && (x.u.priority ?? 0) >= 8, limit: 5 },
    { id: "pending", title: "Pending assessments", kind: "pending" },
    { id: "gaps", title: "Coverage gaps", kind: "gaps" },
  ],
};

export const VIEW_LIMIT = 5;

// Splits the briefing's updates into the view's sections, each update once.
export function viewSections(base, briefing) {
  const used = new Set();
  const sections = (VIEWS[base] ?? []).map((s) => {
    if (s.kind) return { ...s, items: [] };
    const items = briefing.all.filter((x) => !used.has(x.u.id) && s.pick(x));
    items.forEach((x) => used.add(x.u.id));
    return { ...s, items };
  });
  return { sections, rest: briefing.all.filter((x) => !used.has(x.u.id)) };
}

// Assessments and assignments still open, for leaders and QPPVs.
export function pendingWork(items, inScope) {
  const open = Object.entries(items)
    .filter(([, r]) => !r.dismissed && (r.assess?.status === "open" || r.assess?.status === "action" || (r.assign && !r.assess)))
    .map(([id, r]) => ({ id, rec: r }));
  const unassessedHigh = inScope.filter((x) => !items[x.u.id]?.assess && !items[x.u.id]?.dismissed && (x.u.priority ?? 0) >= 8);
  const byStatus = {};
  for (const r of Object.values(items)) if (r.assess) byStatus[r.assess.status] = (byStatus[r.assess.status] ?? 0) + 1;
  return { open, unassessedHigh, byStatus };
}

// Countries in the reader's scope with no updates, or only news coverage, in the window,
// and sources that failed on the last build. Facts about the feed, not about the regulators.
export function coverageGaps(updates, { countries, profileCountries = [], since, feeds }) {
  const inWindow = updates.filter((u) => !u.published || Date.parse(u.published) >= since);
  const scope = profileCountries.length ? countries.filter((c) => profileCountries.includes(c.code)) : countries;
  const none = [];
  const newsOnly = [];
  for (const c of scope) {
    const mine = inWindow.filter((u) => u.country === c.code);
    if (!mine.length) none.push(c);
    else if (!mine.some((u) => u.kind === "official")) newsOnly.push(c);
  }
  return { none, newsOnly, failedFeeds: feeds?.failed ?? 0, totalFeeds: feeds?.total ?? 0 };
}
