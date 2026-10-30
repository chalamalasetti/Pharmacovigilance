// Turns an abstract into the detail page's sections without any AI service: it
// splits the abstract into sentences, files each under research question,
// approach, findings, limitations or conclusion (from the abstract's own headings
// when it has them, otherwise from cue phrases), and picks the most central
// sentences as the summary with TextRank over TF-IDF vectors. Every piece is a
// verbatim sentence that remembers where it came from, so nothing on the page
// is rewritten text. The same TF-IDF vectors find related papers and versions.

const ABBREV = /\b(e\.g|i\.e|et al|vs|fig|figs|approx|ca|no|nos|ref|refs|incl|resp|dr|mr|ms|st)\.$/i;

export function splitSentences(text) {
  const parts = String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/);
  const out = [];
  for (const s of parts) {
    if (out.length && (ABBREV.test(out[out.length - 1]) || /\b[A-Z]\.$/.test(out[out.length - 1]))) out[out.length - 1] += ` ${s}`;
    else out.push(s);
  }
  return out.map((s) => s.trim()).filter((s) => s.length > 1);
}

// Structured-abstract headings and the section each belongs to.
const HEADINGS = [
  [/^(background|introduction|context|rationale|importance|motivation|problem)/, "background"],
  [/^(objectives?|aims?|purpose|goals?|research questions?|study objectives?|question)/, "question"],
  [/^(methods?|materials?|design|setting|participants|patients|data sources?|study design|approach|data|interventions?|measurements?|main outcome|exposures?|population|methodology)/, "approach"],
  [/^(results?|findings?|main results?|outcomes?|evaluation)/, "findings"],
  [/^(limitations?|strengths and limitations)/, "limitations"],
  [/^(conclusions?|interpretation|discussion|implications?|significance|relevance|summary|key points?|what this (study|paper) adds)/, "conclusion"],
];

export const sectionOf = (label) => HEADINGS.find(([r]) => r.test(String(label).toLowerCase().trim()))?.[1] ?? null;

const HEADING_WORDS = "BACKGROUND|INTRODUCTION|CONTEXT|OBJECTIVES?|AIMS?|PURPOSE|METHODS?|MATERIALS AND METHODS|DESIGN|SETTING|PARTICIPANTS|DATA SOURCES?|RESULTS?|FINDINGS|LIMITATIONS?|CONCLUSIONS?|INTERPRETATION|DISCUSSION|SIGNIFICANCE";

// Splits an abstract into labelled parts. Accepts PubMed's labelled AbstractText
// list, Europe PMC's "<h4>Methods</h4>" markup, or "METHODS: …" plain text.
export function abstractParts(abstract) {
  if (Array.isArray(abstract)) return abstract.filter((p) => p.text).map((p) => ({ label: p.label || "", text: p.text }));
  let s = String(abstract || "");
  s = s.replace(/<(h\d|b|strong)>\s*([^<]{2,60}?)\s*:?\s*<\/\1>/gi, "\n§$2§ ");
  s = s.replace(new RegExp(`(^|[.\\s])(${HEADING_WORDS})(?:\\s+AND\\s+(?:${HEADING_WORDS}))?\\s*:\\s+`, "g"), (m, pre, h) => `${pre}\n§${h}§ `);
  s = s.replace(/<[^>]+>/g, " ");
  const parts = [];
  for (const chunk of s.split("\n")) {
    const m = chunk.match(/^§([^§]+)§\s*([\s\S]*)$/);
    const text = (m ? m[2] : chunk).replace(/\s+/g, " ").trim();
    if (text) parts.push({ label: m ? m[1].trim() : "", text });
  }
  return parts;
}

const METRIC = /\b(f1|f-?score|f-?measure|auc|auroc|auprc|c-statistic|precision|recall|sensitivity|specificity|accuracy|ppv|npv|positive predictive|negative predictive|kappa|κ|odds ratios?|hazard ratios?|relative risk|ror|prr|ebgm|ic025|mcc|bleu|rouge|agreement|error rate|time sav\w*|reduc\w*)\b[^.]*?\d|\d+(\.\d+)?\s?%/i;

// Cue phrases for abstracts without headings, checked in this order.
const CUES = [
  ["limitations", /\b(limitations?|limited by|was limited|were limited|shortcoming|caveat|did not (assess|evaluate|include)|small sample|single[- ](site|centre|center|institution))\b/i],
  ["question", /\b(we aimed|this study aim|aims? (of this|to)|objective|we (sought|investigated|examined|explored|evaluated whether|assessed whether)|to (evaluate|assess|investigate|determine|examine|explore|develop|compare)\b|this (study|paper|work) (proposes|presents|describes|investigates|evaluates|examines))/i],
  ["conclusion", /\b(in conclusion|we conclude|these (findings|results) (suggest|indicate|show|demonstrate)|our (findings|results) (suggest|indicate|show)|this (study|work) (demonstrates|shows|suggests)|could (support|help|improve)|may (support|help|improve))/i],
  ["findings", /\b(results? (showed|show|indicated|demonstrated)|we (found|identified|observed)|achieved|outperform\w*|was associated|were associated|significantly)\b/i],
  ["approach", /\b(we (propose|present|describe|used|applied|developed|trained|built|designed|conducted|analy[sz]ed|retrieved|extracted|annotated|collected|fine-tuned|compared)|using|data from|dataset|retrospective|prospective|cohort|cross-sectional|was (trained|developed|evaluated)|were (extracted|annotated|retrieved|collected|analy[sz]ed))\b/i],
];

// Every sentence of the abstract with the section it belongs to and where it came from.
export function classifySentences(abstract) {
  const parts = abstractParts(abstract);
  const structured = parts.some((p) => sectionOf(p.label));
  const out = [];
  for (const p of parts) {
    const fromHeading = sectionOf(p.label);
    for (const s of splitSentences(p.text)) {
      let section = fromHeading;
      // A results sentence that is really about limitations still counts as one.
      if (section === "findings" || section === "conclusion" || section === "background" || !section) {
        if (CUES[0][1].test(s)) section = "limitations";
      }
      if (!section) section = CUES.find(([, r]) => r.test(s))?.[0] ?? (METRIC.test(s) ? "findings" : null);
      out.push({ text: s, section, label: p.label || null, n: out.length + 1 });
    }
  }
  // Unlabelled abstracts usually open with background and close with the conclusion.
  if (!structured && out.length > 2) {
    if (!out[0].section) out[0].section = "background";
    const last = out[out.length - 1];
    if (!last.section || last.section === "findings") last.section = METRIC.test(last.text) ? "findings" : "conclusion";
  }
  for (const s of out) {
    if (!s.section) s.section = "other";
    s.metric = METRIC.test(s.text);
  }
  return { structured, sentences: out };
}

// ---- TF-IDF and TextRank ----

const STOP = new Set("a an and are as at be been being but by can could did do does for from had has have how however in into is it its may might more most no not of on or our over such than that the their them then there these they this those through to under using was we were what when where which while who will with within would also both each between among based study studies paper results result method methods data use used".split(" "));

export const tokens = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 4 ? w.replace(/(ies)$/, "y").replace(/(es|s)$/, "") : w));

export function idfTable(docs) {
  const df = new Map();
  for (const d of docs) for (const t of new Set(tokens(d))) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length || 1;
  return (t) => Math.log(1 + n / (1 + (df.get(t) ?? 0)));
}

export function vector(text, idf) {
  const tf = new Map();
  for (const t of tokens(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  let norm = 0;
  for (const [t, c] of tf) {
    const w = (1 + Math.log(c)) * idf(t);
    tf.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of tf) tf.set(t, w / norm);
  return tf;
}

export function cosine(a, b) {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [t, w] of a) s += w * (b.get(t) ?? 0);
  return s;
}

// Indexes of the k most central sentences (TextRank), in reading order.
export function textRank(sentences, idf, k = 2) {
  if (sentences.length <= k) return sentences.map((_, i) => i);
  const vecs = sentences.map((s) => vector(s, idf));
  const n = vecs.length;
  const w = vecs.map((a, i) => vecs.map((b, j) => (i === j ? 0 : cosine(a, b))));
  const out = w.map((row) => row.reduce((x, y) => x + y, 0) || 1);
  let score = new Array(n).fill(1 / n);
  for (let it = 0; it < 30; it++) {
    score = score.map((_, i) => 0.15 / n + 0.85 * w.reduce((acc, row, j) => acc + (row[i] / out[j]) * score[j], 0));
  }
  return score
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.i)
    .sort((a, b) => a - b);
}

// ---- Evidence maturity ----

const HEDGE = /\b(future|should|needs?|needed|warrant\w*|lack\w*|without|not yet|remains? to|further|would require|planned|plan to)\b/i;

export const MATURITY = [
  { id: "operational", label: "Operational evidence reported", rule: /\b(deployed|deployment|in production|implemented (in|into|at|across)|implementation (in|at|of the)|routine (use|practice|operations?)|operational (use|setting|environment|data)|in daily (use|practice)|has been (in use|used since)|post-implementation|went live|live (use|system))\b/i },
  { id: "external", label: "Externally evaluated", rule: /\b(external(ly)? (validat\w*|evaluat\w*|test\w*)|independent (test|validation|evaluation)? ?(data ?sets?|cohorts?|data|sites?)|prospective(ly)? (evaluat\w*|validat\w*|tested)|multi-?(site|centre|center|national|institutional)|across (\w+ )?(institutions|sites|countries|databases))\b/i },
  { id: "experimental", label: "Experimentally evaluated", rule: null },
  { id: "concept", label: "Concept proposed", rule: /\b(we propose|proposed (a |an )?(framework|approach|architecture|model)|conceptual|framework|perspective|position paper|we describe|roadmap|vision)\b/i },
];

const EVALUATED = /\b(evaluat\w*|validat\w*|compared (with|to|against)|benchmark\w*|test set|cross-validation|performance|accuracy|annotated|gold standard|reference standard|reference set)\b/i;

// The evidence-maturity label with the sentence that justifies it. Reviews and
// commentary describe others' work, so they get no label of their own.
export function assessMaturity(sentences, type) {
  if (type === "review" || type === "commentary" || type === "notice") {
    return { id: "na", label: "Not assessed", reason: type === "review" ? "Reviews summarise other studies, so maturity is assessed on the studies themselves." : "Commentary and notices do not report an evaluation." };
  }
  const find = (rule) => sentences.find((s) => rule.test(s.text) && !(HEDGE.test(s.text) && s.section !== "findings"));
  for (const m of MATURITY) {
    if (m.id === "experimental") {
      const s = sentences.find((x) => x.metric && (x.section === "findings" || x.section === "conclusion")) ?? find(EVALUATED);
      if (s) return { id: m.id, label: m.label, reason: s.metric ? "The abstract reports evaluation results." : "The abstract describes an evaluation.", quote: s.text, ref: s.n };
      continue;
    }
    const s = find(m.rule);
    if (s) return { id: m.id, label: m.label, reason: `The abstract says “${s.text.match(m.rule)[0]}”.`, quote: s.text, ref: s.n };
  }
  return { id: "unclear", label: "Not enough information", reason: "The abstract does not describe an evaluation or a proposed approach clearly enough to judge." };
}
