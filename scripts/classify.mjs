// Plain keyword rules that sort each update into the sections a PV team cares about,
// decide whether a general news item is about drug safety or regulation at all,
// and work out which country (or international body) it concerns.

// Order matters: the first section whose words appear in the headline becomes the
// update's main category; every section that matches is kept as a tag so filters
// still find it. "Background" words only say the story is about drug safety in
// general, so they decide the section only when nothing more specific matches
// (a "pharmacovigilance guidance" is a guideline).
export const CATEGORIES = [
  {
    id: "safety",
    label: "Safety alerts & signals",
    words: [
      "safety communication", "safety alert", "safety signal", " signal", "adverse event", "adverse reaction", "adverse drug",
      "side effect", "serious risk", "risk of", "warns", "warning", "boxed warning", "black box", " prac ", " dhpc ",
      "dear healthcare professional", "direct healthcare professional", "rote hand brief", "drug safety update",
      "contraindicat", "hepatotoxicity", "anaphylaxis", "myocarditis", "suicidal", "death", "fatal", "medication error",
    ],
    background: ["pharmacovigilance", "farmacovigil", "pharmakovigilanz", "vigibase", "yellow card", "faers", "eudravigilance", "adverse", "side effect"],
  },
  {
    id: "recall",
    label: "Recalls & quality",
    words: [
      "recall", "withdrawn", "withdrawal", "withdraws", "suspend", "suspension", "contaminat", "nitrosamine", "ndma",
      "falsified", "counterfeit", "substandard", "out of specification", "sterility", "defect", "retiro", "rappel", "ritiro",
    ],
  },
  {
    id: "label",
    label: "Label changes",
    words: ["label", "labelling", "labeling", "smpc", "product information", "package insert", "prescribing information", "patient leaflet", "revision of precautions", "revised precautions"],
  },
  {
    id: "guideline",
    label: "Guidelines & guidance",
    words: [
      "guideline", "guidance", " gvp", "good pharmacovigilance practice", "ich e2", "e2b", "e2e", "e2c", "e2d", "m1 meddra",
      "cioms", "question and answer", "q&a", "reflection paper", "best practice", "template", "points to consider",
    ],
  },
  {
    id: "regulation",
    label: "Regulatory changes",
    words: [
      "regulation", "regulatory", " rule ", " rules ", "final rule", "proposed rule", " law ", "legislation", "directive", "amendment",
      " act ", "gazette", "notification", "mandate", "requirement", "comes into force", "into effect", "effective date",
      "deadline", "implementing", "decree", "resolution", "resolución", "resolução", "ordinance", " bill ",
    ],
  },
  {
    id: "policy",
    label: "Policy & strategy",
    words: [
      "policy", "strategy", "consultation", "framework", "reform", "roadmap", "work plan", "reliance", "harmonis",
      "harmoniz", "agreement", "memorandum", " mou ", "collaboration", "partnership", "public comment", "white paper",
    ],
  },
  {
    id: "inspection",
    label: "Inspections & enforcement",
    words: ["inspection", "form 483", "enforcement", "non compliance", "noncompliance", "penalty", " fine ", " fined ", "seized", "seizure", "crackdown", "audit", "license cancel", "licence cancel"],
  },
  {
    id: "approval",
    label: "Approvals & authorisations",
    words: ["approv", "authoris", "authoriz", "marketing authorisation", "clears", "clearance", "positive opinion", "registration"],
  },
  { id: "news", label: "Industry & science news", words: [] },
];

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

// Words that make a general news item worth a PV professional's time.
const PV_WORDS = [
  "drug", "medicine", "medicinal", "pharma", "vaccine", "biologic", "biosimilar", "therapeutic", "medical product",
  "medical device", "tablet", "injection", "dose", "prescri", "pharmacovigil", "farmacovigil", "pharmakovigil",
  "adverse", "side effect", "precaution", "safety", "recall", "label", "regulat", "guideline", "guidance", " ich ", "cioms",
  "medicament", "médicament", "medicamento", "farmaco", "arzneimittel", "obat", "ilaç", "geneesmiddel", "läkemedel",
];

// Agency feeds also carry food, tobacco and cosmetics news; skip those unless a medicine is involved.
const OFF_TOPIC = /\b(food|foods|tobacco|cigarette|vape|e.?cigarette|cosmetic|pet food|animal feed|salmonella|listeria|allergen|undeclared (milk|egg|peanut|soy|wheat))\b/i;

// Lower case, with punctuation turned into spaces so " law " can't match "flaw," or "lawsuit".
// A "warning letter" is enforcement, not a safety warning, so it becomes one word first.
const lower = (s) =>
  ` ${String(s || "").toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, " ").replace(/warning letters?/g, "enforcement letter")} `;

export function categorize(title, summary = "", fallback = null) {
  const hay = lower(`${title} ${summary}`);
  const titleHay = lower(title);
  const has = (h, words = []) => words.some((w) => h.includes(w));
  const tags = CATEGORIES.filter((c) => has(hay, c.words) || has(hay, c.background)).map((c) => c.id);
  // A section named in the headline beats one only hinted at in the summary or the feed.
  const inTitle = CATEGORIES.find((c) => has(titleHay, c.words));
  const known = fallback && CATEGORY_IDS.has(fallback) ? fallback : null;
  const specific = CATEGORIES.find((c) => has(hay, c.words));
  const category = inTitle?.id ?? known ?? specific?.id ?? tags[0] ?? "news";
  if (known && !tags.includes(known)) tags.push(known);
  if (!tags.includes(category)) tags.unshift(category);
  return { category, tags };
}

// A story that names a medicines regulator counts as relevant too, unless it is about food or tobacco.
export function isRelevant(title, summary = "", { namesRegulator = false } = {}) {
  const hay = lower(`${title} ${summary}`);
  const pv = namesRegulator || PV_WORDS.some((w) => hay.includes(w));
  if (!pv) return false;
  // "Food recall" is off topic; "food and drug administration" is not.
  const offTopic = OFF_TOPIC.test(hay.replace(/food and drugs? (administration|authority)/g, ""));
  return !offTopic || /\b(drug|medicine|vaccine|pharmacovigil|medicinal)\b/.test(hay);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Builds one matcher per alias. Short all-caps names (FDA, EMA, UK) must match case
// exactly so "who" and "us" in ordinary sentences don't count.
export function countryMatchers(agencies) {
  const matchers = [];
  for (const c of agencies) {
    const names = [
      ...c.agencies.flatMap((a) => [a.abbr, ...a.aliases].map((n) => ({ n, agency: a.abbr, weight: 2 }))),
      ...c.terms.map((n) => ({ n, agency: null, weight: 1 })),
    ];
    for (const { n, agency, weight } of names) {
      if (!n || ["global", "worldwide", "international"].includes(n.toLowerCase())) continue;
      const exact = n.length <= 6 && n === n.toUpperCase();
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}(?=$|[^\\p{L}\\p{N}])`, exact ? "gu" : "giu");
      matchers.push({ code: c.code, agency, name: n, weight, re });
    }
  }
  return matchers;
}

// The country the text is mostly about: agency names count double, a longer name that
// contains a shorter one ("FDA Philippines" vs "FDA") wins, and ties go to the earliest mention.
export function detectCountry(text, matchers) {
  const hits = [];
  for (const m of matchers) {
    m.re.lastIndex = 0;
    for (const r of String(text || "").matchAll(m.re)) {
      const start = r.index + r[1].length;
      hits.push({ ...m, start, end: start + m.name.length });
    }
  }
  const kept = hits.filter(
    (h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start),
  );
  if (!kept.length) return null;
  const score = new Map();
  for (const h of kept) {
    const s = score.get(h.code) ?? { code: h.code, points: 0, first: h.start, agency: null };
    s.points += h.weight;
    s.first = Math.min(s.first, h.start);
    s.agency ??= h.agency;
    score.set(h.code, s);
  }
  return [...score.values()].sort((a, b) => b.points - a.points || a.first - b.first)[0];
}
