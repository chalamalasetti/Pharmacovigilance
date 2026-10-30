// Turns an update into a structured impact card, and scores updates for a reader's
// briefing. Everything here is plain rules over the headline and summary the source
// published: nothing is invented. Each implication carries the words that triggered
// it, and anything that is a judgement rather than a quote is labelled "potential".
// Pure functions, shared by the pages and the tests.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// "1 March 2027", "March 1, 2027", "2027-03-01" or just "March 2027".
const DATE = `(\\d{1,2}(?:st|nd|rd|th)?\\s+${MON}\\.?,?\\s+\\d{4}|${MON}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|${MON}\\.?\\s+\\d{4})`;

// Each date pattern names what kind of date it is. They are tried in order and a
// date string is used once, so "comments by 1 March 2027" is never also read as an
// effective date.
const DATE_RULES = [
  { type: "consultation", re: new RegExp(`(?:consultation|comments?|feedback|submissions?|public input)[^.;]{0,80}?(?:by|until|before|closes?|closing|ends?|deadline(?: is| of)?)\\s*(?:on\\s*)?:?\\s*${DATE}`, "gi") },
  { type: "consultation", re: new RegExp(`(?:consultation|comment period)[^.;]{0,40}?(?:open|runs?)[^.;]{0,40}?(?:until|to|through)\\s*${DATE}`, "gi") },
  { type: "transition", re: new RegExp(`transition(?:al)? period[^.;]{0,60}?(?:until|ending(?: on)?|ends(?: on)?|to)\\s*${DATE}`, "gi") },
  { type: "effective", re: new RegExp(`(?:effective|takes? effect|in(?:to)? force|into effect|applies|will apply|apply from|application date|mandatory|implementation date|compliance date|be implemented)[^.;]{0,60}?(?:from|on|as of|by|date(?: of| is)?|:)?\\s*${DATE}`, "gi") },
  { type: "deadline", re: new RegExp(`(?:deadline|due|no later than|must be submitted by)[^.;]{0,40}?${DATE}`, "gi") },
];
const TRANSITION_LENGTH = /transition(?:al)? period(?: of)?[^.;]{0,30}?\b(\d{1,2}|one|two|three|six|nine|twelve|eighteen|twenty-four|thirty-six)[\s-]+(months?|years?)/gi;

export const DATE_LABELS = {
  published: "Published",
  effective: "Effective / applies from",
  consultation: "Consultation closes",
  transition: "Transition period",
  deadline: "Other deadline",
};

// Turns "1 March 2027" or "March 2027" into 2027-03-01 (first of the month when no day is given).
export function parseDate(s) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = s.toLowerCase().replace(/(\d)(st|nd|rd|th)/, "$1").replace(/[.,]/g, " ");
  const m = MONTHS.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}`).test(t));
  const year = /\b(\d{4})\b/.exec(t)?.[1];
  if (m < 0 || !year) return null;
  const day = /\b(\d{1,2})\b/.exec(t.replace(year, ""))?.[1] ?? "1";
  return `${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// Effective dates, consultation deadlines, transition periods and other deadlines
// stated in the text, each with the exact words it came from.
export function extractDates(text) {
  const src = String(text || "");
  const out = [];
  const used = new Set();
  for (const { type, re } of DATE_RULES) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const value = m[1].trim();
      if (used.has(value)) continue;
      used.add(value);
      out.push({ type, value, date: parseDate(value), quote: m[0].trim() });
    }
  }
  TRANSITION_LENGTH.lastIndex = 0;
  for (const m of src.matchAll(TRANSITION_LENGTH)) out.push({ type: "transition", value: `${m[1]} ${m[2]}`, date: null, quote: m[0].trim() });
  return out;
}

// Medicine names by their INN stem (examplazole, testmab, semaglutide…) plus a few
// names that have no tell-tale ending. A name pattern is a guess, so the card says so.
const STEMS = [
  "mab", "tinib", "ciclib", "rafenib", "parib", "azole", "prazole", "pril", "sartan", "olol", "statin", "dipine", "cillin", "mycin",
  "cycline", "floxacin", "oxacin", "parin", "gliflozin", "gliptin", "glutide", "tide", "afil", "triptan", "setron", "lukast", "semide",
  "zepam", "azolam", "oxetine", "profen", "coxib", "platin", "taxel", "rubicin", "lidomide", "glitazone", "formin", "vir", "navir",
  "previr", "asvir", "tegravir", "cept", "kinra", "umab", "nercept", "triptyline", "peridol", "apine", "idone", "isone", "olone",
  "caine", "dronate", "tretinoin", "conazole", "terol", "sonide", "trexate", "lutamide", "relin", "zomib", "degib", "lisib", "racetam",
];
const NAMED = [
  "valproate", "isotretinoin", "paracetamol", "acetaminophen", "codeine", "tramadol", "metamizole", "finasteride", "dutasteride",
  "methotrexate", "hydroxychloroquine", "insulin", "warfarin", "clozapine", "carbamazepine", "lamotrigine", "topiramate", "levetiracetam",
  "fluoroquinolone", "fluoroquinolones", "ranitidine", "metformin", "nitrofurantoin", "pseudoephedrine", "domperidone", "ondansetron",
  "testosterone", "estradiol", "oxytocin", "heparin", "botulinum", "ozempic", "wegovy", "mounjaro",
];
const NOT_MEDICINES = new Set([
  "april", "peptide", "peptides", "nucleotide", "polypeptide", "except", "accept", "concept", "intercept", "percept", "precept", "excerpt",
  "statement", "guide", "olive", "ozone", "provide", "decide", "aside", "inside", "outside", "beside", "override", "oversight", "survive",
  "reside", "preside", "subside", "wide", "tide", "riptide", "tidal", "cocaine", "periapine", "azoles", "statins", "platinum", "relinquish",
  "isone", "gelatin",
]);
const STEM_RE = new RegExp(`^[a-z]{3,}(?:${STEMS.join("|")})$`);

export function extractSubstances(text) {
  const found = new Map();
  for (const raw of String(text || "").match(/[\p{L}][\p{L}-]{4,}/gu) ?? []) {
    const w = raw.toLowerCase().replace(/-+$/, "");
    if (NOT_MEDICINES.has(w)) continue;
    if (NAMED.includes(w) || (w.length >= 7 && STEM_RE.test(w))) found.set(w, raw[0].toUpperCase() + w.slice(1));
  }
  // Classes like "GLP-1" and "JAK inhibitors" are named outright.
  for (const m of String(text || "").matchAll(/\b(GLP-1|SGLT2|JAK|TNF|PD-1|PD-L1|CAR-T|mRNA|SSRI|ACE|DPP-4)(?: receptor agonists?| inhibitors?| blockers?| vaccines?| therap(?:y|ies))?/g)) {
    found.set(m[0].toLowerCase(), m[0]);
  }
  return [...found.values()];
}

// Lower case with punctuation as spaces, so " rule " can't match "rules," mid-word.
// A "warning letter" is enforcement, not a safety warning.
const norm = (s) => ` ${String(s || "").toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, " ").replace(/warning letters?/g, "enforcement letter")} `;
const firstHit = (hay, words) => words.find((w) => hay.includes(w));

// Who may need to look: each rule fires on a topic tag or on words in the text.
const ROLE_RULES = [
  { role: "Signal management / safety physicians", tags: ["safety"], words: [" signal", "side effect", "risk of"] },
  { role: "QPPV / PV office", tags: ["safety", "guideline", "regulation"], words: ["qppv", "pharmacovigilance system", "psmf"] },
  { role: "Case processing / ICSR management", words: ["icsr", "case report", "individual case", "expedited", "15 day", "e2b", "yellow card", "reporting of suspected"] },
  { role: "Aggregate reporting", words: ["psur", "pbrer", "dsur", "periodic safety", "periodic benefit", "psusa"] },
  { role: "Risk management", words: [" rmp", "risk management plan", "rems", "risk minimi", "dhpc", "direct healthcare professional", "dear healthcare", "pregnancy prevention"] },
  { role: "Regulatory affairs / labelling", tags: ["label", "approval", "regulation"], words: ["label", "smpc", "product information", "package insert", "prescribing information", "leaflet"] },
  { role: "Quality assurance / supply chain", tags: ["recall"], words: ["recall", "lot ", "batch", "contaminat", "nitrosamine", "falsified", "counterfeit"] },
  { role: "PV compliance / inspection readiness", tags: ["inspection"], words: ["inspection", "audit", "capa", "form 483", "enforcement letter", "non compliance", "noncompliance"] },
  { role: "Regulatory intelligence / policy", tags: ["policy"], words: ["consultation", "draft", "public comment", "reform", "strategy"] },
  { role: "Safety systems / IT", words: ["e2b", "meddra", "idmp", "xevmpd", "spor", "gateway", "eudravigilance", "faers", "database", "electronic", "xml", "interface", " api "] },
  { role: "Clinical safety", words: ["clinical trial", "susar", "investigational", "dsur"] },
  { role: "Vaccine PV", words: ["vaccine", "immunis", "immuniz", "aefi"] },
  { role: "Medical device vigilance", words: ["medical device", "device", "mdr ", "incident report"] },
  { role: "Medical information", tags: ["label"], words: ["healthcare professional", "patients should", "advice for"] },
];

// What a team might have to do. "Potential" because only the reader knows their portfolio.
const BUSINESS_RULES = [
  { key: "sop", text: "Potential SOP or work instruction review", tags: ["guideline", "regulation"], words: ["guideline", "guidance", " gvp", "requirement", "procedure", "good pharmacovigilance practice"] },
  { key: "training", text: "Potential training update for affected staff", tags: ["guideline", "regulation"], words: ["new guidance", "updated guidance", "revised guideline", "new requirement", "final rule"] },
  { key: "reporting", text: "Potential change to safety reporting obligations or timelines", words: ["icsr", "expedited", "e2b", "reporting requirement", "reporting of suspected", "report suspected", "yellow card", "psur", "pbrer", "dsur", "susar", "periodic safety"] },
  { key: "monitoring", text: "Potential signal evaluation or enhanced monitoring for affected products", tags: ["safety"], words: [" signal", "risk of", "warning", "side effect", "fatal", "death"] },
  { key: "labelling", text: "Potential labelling / product information update for affected products", tags: ["label"], words: ["label", "smpc", "product information", "boxed warning", "prescribing information", "revision of precautions"] },
  { key: "riskmin", text: "Potential risk management plan or risk communication activity", words: [" rmp", "risk management plan", "rems", "risk minimi", "dhpc", "direct healthcare professional", "dear healthcare", "pregnancy prevention"] },
  { key: "quality", text: "Potential quality review and market action check", tags: ["recall"], words: ["recall", "contaminat", "nitrosamine", "out of specification", "falsified", "counterfeit"] },
  { key: "inspection", text: "Potential inspection readiness or CAPA review", tags: ["inspection"], words: ["inspection", "form 483", "enforcement letter", "audit", "capa"] },
  { key: "consultation", text: "Potential consultation response opportunity", words: ["consultation", "public comment", "draft guidance", "draft guideline", "comments"] },
];

const TECHNICAL_RULES = [
  { key: "icsr", text: "Potential ICSR message format, mapping or validation changes (regression testing)", words: ["e2b", "icsr format", " r3 ", "xml schema", "business rules", "message format"] },
  { key: "meddra", text: "Potential MedDRA version upgrade or coding mapping review", words: ["meddra"] },
  { key: "product-data", text: "Potential product master data or dictionary mapping changes", words: ["idmp", "spor", "xevmpd", "article 57", "product dictionary", "substance dictionary", "whodrug"] },
  { key: "interface", text: "Potential gateway, portal or interface configuration and connectivity testing", words: ["gateway", "as2", "electronic submission", "esg", "portal", "eudravigilance", "faers", "vigiflow", "api ", "interface", "ectd"] },
  { key: "rules", text: "Potential reporting rule (timeline, criteria or destination) configuration in the safety database", words: ["expedited", "reporting timeline", "reporting requirement", "15 day", "90 day", "reporting criteria", "submission requirement"] },
  { key: "listedness", text: "Potential update to listedness / expectedness reference data in the safety database", tags: ["label"], words: ["new adverse reaction", "added to the product information", "added to the label", "boxed warning", "revision of precautions", "update the product information"] },
  { key: "signal-config", text: "Potential signal detection configuration (new terms, products or thresholds)", words: ["signal detection", "data mining", "disproportionality", "medical concept", "designated medical event"] },
  { key: "validation", text: "Potential computerised system validation or testing", words: ["computerised system", "computerized system", "validation", "annex 11", "part 11", "artificial intelligence", " ai ", "machine learning"] },
];

// "GVP Module VI", "Article 107", "Section 4.8", "Annex II": the part of the source that applies, when the text names one.
const SECTION_RE = /\b(?:GVP\s+)?Module\s+[IVXL]+(?:\s+Addendum\s+[IVXL]+)?|\bArticle\s+\d+[a-z]?(?:\(\d+\))?|\bSection\s+\d+(?:\.\d+)*|\bAnnex\s+(?:[IVXL]+|\d+)\b|\bPart\s+\d+(?:\.\d+)?\b|\b21\s*CFR\s*[\d.]+|\bChapter\s+\d+/g;

function applyRules(rules, hay, tags) {
  const out = [];
  for (const r of rules) {
    const tag = r.tags?.find((t) => tags.includes(t));
    const word = firstHit(hay, r.words ?? []);
    if (tag || word) out.push({ text: r.text ?? r.role, key: r.key, trigger: word ? word.trim() : `${tag} topic` });
  }
  return out;
}

// The first sentence or two of what the source itself wrote.
export function whatChanged(u) {
  const s = String(u.summary || "").trim();
  if (!s) return { text: u.title, from: "headline" };
  const sentences = s.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [s];
  let text = "";
  for (const x of sentences) {
    if (text && (text + x).length > 300) break;
    text += x;
  }
  text = text.trim();
  if (text.length > 320) text = `${text.slice(0, 317)}…`;
  return { text, from: "summary" };
}

// The whole card. `place` is { country, agency } as names for the reader.
export function impactCard(u, { countryName = (c) => c } = {}) {
  const text = `${u.title}. ${u.summary ?? ""}`;
  const hay = norm(text);
  const tags = u.tags ?? [u.category];
  const dates = [{ type: "published", value: u.published, date: u.published?.slice(0, 10) ?? null, quote: null }, ...extractDates(text)];
  return {
    changed: whatChanged(u),
    affected: {
      roles: applyRules(ROLE_RULES, hay, tags),
      jurisdictions: [countryName(u.country), u.agency].filter(Boolean),
      substances: extractSubstances(text),
    },
    business: applyRules(BUSINESS_RULES, hay, tags),
    technical: applyRules(TECHNICAL_RULES, hay, tags),
    dates,
    evidence: {
      source: u.source,
      link: u.link,
      official: u.kind === "official",
      sections: [...new Set(text.match(SECTION_RE) ?? [])],
      retrieved: u.retrieved ?? null,
    },
  };
}

// Plain-text version of a card, for email and the clipboard.
export function cardText(u, card, { status = "Automated extraction, not reviewed" } = {}) {
  const list = (xs) => (xs.length ? xs.map((x) => `  - ${x.text ?? x}${x.trigger ? ` (matched "${x.trigger}")` : ""}`).join("\n") : "  - None detected by rules");
  const dates = card.dates.map((d) => `  - ${DATE_LABELS[d.type]}: ${d.type === "published" ? (d.date ?? "unknown") : `${d.value}${d.quote ? ` ("${d.quote}")` : ""}`}`).join("\n");
  return [
    u.title,
    u.link,
    "",
    `What changed (${card.changed.from === "summary" ? "from the source summary" : "headline only"}): ${card.changed.text}`,
    "",
    "Who may be affected:",
    list(card.affected.roles.map((r) => r.text)),
    `  Jurisdictions: ${card.affected.jurisdictions.join(", ") || "unknown"}`,
    `  Products/substances named: ${card.affected.substances.join(", ") || "none detected"}`,
    "",
    "Business impact (potential):",
    list(card.business),
    "",
    "Technical impact (potential):",
    list(card.technical),
    "",
    "Dates:",
    dates,
    "",
    `Evidence: ${card.evidence.official ? "Official regulator feed" : "News report (find the official notice)"}: ${card.evidence.source}. Retrieved ${card.evidence.retrieved?.slice(0, 10) ?? "unknown"}. Review status: ${status}.`,
    "",
    "Impact fields are generated by keyword rules from the source text and must be checked against the official source.",
  ].join("\n");
}

// Roles a reader can pick, and the topics each cares most about (used to rank the briefing).
export const ROLES = [
  { id: "qppv", label: "QPPV / PV head", topics: { safety: 3, guideline: 3, regulation: 3, inspection: 2, policy: 1 } },
  { id: "signal", label: "Signal management / safety physician", topics: { safety: 3, label: 2, recall: 1 } },
  { id: "case", label: "Case processing / ICSR", topics: { guideline: 2, regulation: 3, safety: 1 }, impact: ["reporting", "rules", "icsr"] },
  { id: "aggregate", label: "Aggregate reporting", topics: { guideline: 2, regulation: 2, safety: 2 }, impact: ["reporting"] },
  { id: "ra", label: "Regulatory affairs / labelling", topics: { label: 3, approval: 2, regulation: 2, guideline: 1 }, impact: ["labelling"] },
  { id: "qa", label: "Quality / compliance", topics: { recall: 3, inspection: 3, guideline: 1 }, impact: ["quality", "inspection", "sop"] },
  { id: "systems", label: "Safety systems / IT", topics: { guideline: 2, regulation: 2 }, technical: true },
  { id: "intel", label: "Regulatory intelligence", topics: { regulation: 3, policy: 3, guideline: 3 }, impact: ["consultation"] },
];

export const TOPICS = ["safety", "recall", "label", "guideline", "regulation", "policy", "inspection", "approval", "news"];

const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Watchlist terms (products, substances, keywords) found in an update.
export function watchHits(u, watch = []) {
  const hay = fold(`${u.title} ${u.summary ?? ""} ${u.agency ?? ""}`);
  return watch.filter((w) => w.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${fold(w.trim()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(hay));
}

// Whether an update belongs in a reader's briefing, and how high. Watchlist hits always
// count; otherwise the update must be in one of their countries (international bodies
// always count) and, when they picked topics, one of those topics.
export function briefingScore(u, profile = {}, card = null) {
  const hits = watchHits(u, profile.watch);
  const inPlace = !profile.countries?.length || profile.countries.includes(u.country) || u.country === "INT";
  const inTopic = !profile.topics?.length || u.tags.some((t) => profile.topics.includes(t));
  if (!hits.length && !(inPlace && inTopic)) return { score: 0, hits };
  const role = ROLES.find((r) => r.id === profile.role);
  let score = hits.length * 6 + (u.priority ?? 0) / 2 + (u.kind === "official" ? 2 : 0);
  if (profile.countries?.includes(u.country)) score += 2;
  if (role) {
    score += Math.max(0, ...u.tags.map((t) => role.topics[t] ?? 0));
    if (card && role.technical && card.technical.length) score += 3;
    if (card && role.impact && [...card.business, ...card.technical].some((x) => role.impact.includes(x.key))) score += 2;
  }
  return { score: Math.round(score * 10) / 10, hits };
}

const WINDOWS = { "24h": 1, "7d": 7, "30d": 30 };

// Everything My PV Briefing shows, from the updates and the reader's workspace:
// new updates in their scope ranked for their role, watchlist hits, new updates
// about substances they follow, and dates still ahead. Dismissed updates drop out.
export function buildBriefing(updates, ws, { window = "24h", now = Date.now(), lastVisit = null, countryName } = {}) {
  const profile = ws.profile ?? {};
  const items = ws.items ?? {};
  const since = window === "visit" && lastVisit ? Date.parse(lastVisit) : now - (WINDOWS[window] ?? 1) * 86400000;
  const isNew = (u) => !u.published || Date.parse(u.published) >= since;
  const today = new Date(now).toISOString().slice(0, 10);

  const scored = [];
  const upcoming = [];
  for (const u of updates) {
    if (items[u.id]?.dismissed) continue;
    const card = impactCard(u, { countryName });
    const { score, hits } = briefingScore(u, profile, card);
    if (!score) continue;
    for (const d of card.dates) if (d.type !== "published" && d.date && d.date >= today) upcoming.push({ ...d, update: u });
    if (isNew(u)) scored.push({ u, card, score, hits });
  }
  scored.sort((a, b) => b.score - a.score || (b.u.published ?? "").localeCompare(a.u.published ?? ""));

  // Follow-ups: new updates naming a substance from an update the reader follows.
  const followed = Object.entries(items).filter(([, r]) => r.followed && r.follow?.length);
  const followUps = [];
  if (followed.length) {
    for (const u of updates) {
      if (items[u.id] || !isNew(u)) continue;
      const subs = extractSubstances(`${u.title}. ${u.summary ?? ""}`).map((s) => s.toLowerCase());
      const about = followed.flatMap(([, r]) => r.follow).filter((s) => subs.includes(s.toLowerCase()));
      if (about.length) followUps.push({ u, about: [...new Set(about)] });
    }
  }

  return {
    since: new Date(since).toISOString(),
    watch: scored.filter((x) => x.hits.length),
    review: scored.filter((x) => !x.hits.length && !items[x.u.id]?.assess),
    all: scored,
    followUps,
    upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20),
    counts: {
      total: scored.length,
      safety: scored.filter((x) => x.u.tags.includes("safety") || x.u.tags.includes("recall")).length,
      regulatory: scored.filter((x) => ["regulation", "guideline", "policy"].some((t) => x.u.tags.includes(t))).length,
      unassessed: scored.filter((x) => !items[x.u.id]?.assess).length,
    },
  };
}
