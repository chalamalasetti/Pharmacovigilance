// The Research & Innovation taxonomy: two tagging dimensions, so a safety scientist
// browsing by PV process and an engineer browsing by method find the same paper.
// Tags come from keyword rules on the title, abstract and keywords; each tag keeps
// the words that triggered it so readers (and later, admins) can see why.
// Bump TAXONOMY_VERSION whenever a topic or rule changes meaning.

export const TAXONOMY_VERSION = "2026-10-1";

export const APPLICATIONS = [
  {
    id: "intake",
    label: "Case intake and processing",
    rules: [/\bcase (intake|processing|triage)\b/, /\bindividual case safety reports?\b/, /\bicsrs?\b/, /\bcase reports? (processing|triage|extraction)\b/, /\bvalidity criteria\b/, /\be2b\b/, /\bseriousness (assessment|classification)\b/],
    business: "Could change how case intake teams receive, triage and enter adverse event reports, and where reviewer time is spent.",
    technical: "Touches the intake pipeline of the safety database: source document parsing, E2B fields, validation rules and the audit trail of automated steps.",
    explore: ["How did the approach handle unstructured sources such as emails, call notes or scanned forms?", "What share of cases would still need full manual processing?"],
  },
  {
    id: "literature",
    label: "Literature screening",
    rules: [/\bliterature (screening|monitoring|surveillance|review)\b/, /\bscreening (of )?(abstracts|articles|citations|publications)\b/, /\bsystematic reviews? automation\b/, /\btitle and abstract screening\b/, /\bmedical literature\b/],
    business: "Could affect how literature monitoring teams triage search hits and how many articles need full human review.",
    technical: "Needs integration with literature search exports, a record of every screening decision, and evaluation against human reviewer decisions.",
    explore: ["What recall did the approach reach, and is that acceptable for regulatory literature monitoring?", "How were missed relevant articles found and counted?"],
  },
  {
    id: "coding",
    label: "Medical coding and narratives",
    rules: [/\bmeddra\b/, /\bwhodrug\b/, /\bmedical coding\b/, /\bauto-?coding\b/, /\bcase narratives?\b/, /\bnarrative (generation|writing|summari[sz]ation)\b/, /\bcoding of (adverse|events|terms)\b/],
    business: "Could change coding and narrative-writing effort per case, and the consistency of coded terms across the team.",
    technical: "Depends on dictionary versions (MedDRA, WHODrug), term mapping logic and reviewer override workflows.",
    explore: ["Which MedDRA level (LLT, PT) was evaluated, and how were disagreements between coders handled?", "Would the result hold after a dictionary version upgrade?"],
  },
  {
    id: "quality",
    label: "Case quality and duplicate detection",
    rules: [/\bduplicate (case |safety |individual case safety )?reports?\b/, /\breports? duplicat\w+/, /\bduplicate detection\b/, /\bdeduplication\b/, /\brecord linkage\b/, /\bdata quality\b/, /\bcase quality\b/, /\bcompleteness of (case |safety )?reports?\b/],
    business: "Could reduce duplicate cases and rework, and change how case quality is checked before submission.",
    technical: "Involves matching logic across database records, thresholds for human review, and quality metrics on the case data model.",
    explore: ["How many true duplicates were missed, and how many false matches would a reviewer have to clear?"],
  },
  {
    id: "signal",
    label: "Signal detection and assessment",
    rules: [/\bsignal (detection|management|assessment|validation|refinement|prioriti[sz]ation)\b/, /\bsafety signals?\b/, /\bdisproportionality\b/, /\b(prr|ror|ebgm|bcpnn|information component)\b/, /\bpharmacovigilance signals?\b/],
    business: "Could change which safety signals are prioritised, how early they surface, and the workload of signal review meetings.",
    technical: "Touches statistical signal detection on spontaneous report data (FAERS, VigiBase, EudraVigilance), thresholds and reference sets used for evaluation.",
    explore: ["Was the method evaluated against a reference set of known positive and negative drug-event pairs?", "How many additional signals would reach review each month at the reported threshold?"],
  },
  {
    id: "rwe",
    label: "Real-world safety evidence",
    rules: [/\breal-world (data|evidence)\b/, /\belectronic (health|medical) records?\b/, /\bclaims (data|database)\b/, /\bactive surveillance\b/, /\bsentinel\b/, /\btarget trial\b/, /\bpharmacoepidemiolog/, /\bregistr(y|ies)\b/],
    business: "Could change how signals are confirmed or refuted with healthcare data, and what evidence goes into safety assessments.",
    technical: "Needs access to linked healthcare data, a common data model (such as OMOP), and reproducible study code.",
    explore: ["Which data source and population were used, and would they represent your products' users?"],
  },
  {
    id: "aggregate",
    label: "Aggregate reporting",
    rules: [/\bpsurs?\b/, /\bpbrers?\b/, /\bdsurs?\b/, /\bperiodic (safety|benefit-risk) (update )?reports?\b/, /\baggregate (safety )?reports?\b/, /\brisk management plans?\b/],
    business: "Could change how periodic reports (PSUR/PBRER, DSUR) are drafted and reviewed, and the time to submission.",
    technical: "Involves pulling line listings and summary tabulations from the safety database and tracking which text was drafted automatically.",
    explore: ["Which report sections were tested, and who reviewed the drafted text?"],
  },
  {
    id: "regintel",
    label: "Regulatory intelligence",
    rules: [/\bregulatory intelligence\b/, /\bregulatory (documents?|guidance|requirements?)\b/, /\blabel(ling)? (changes?|updates?)\b/, /\bproduct information\b/, /\bsmpcs?\b/, /\bregulatory (agenc|authorit)/],
    business: "Could change how teams track regulator guidance and label changes, and how fast they assess impact.",
    technical: "Needs monitoring of regulator sources, document comparison and traceability back to the official text.",
    explore: ["How was the approach kept current as regulator documents changed?"],
  },
  {
    id: "patient",
    label: "Patient reporting",
    rules: [/\bpatient[- ]reported\b/, /\bpatient reporting\b/, /\bconsumer reports?\b/, /\bsocial media\b/, /\btwitter\b|\breddit\b|\bonline forums?\b/, /\bmobile app(lication)?s?\b.*\breport/],
    business: "Could change how patient and consumer reports, including social media, feed into safety monitoring.",
    technical: "Involves collecting and de-identifying patient-generated text and handling informal language and misspellings.",
    explore: ["How were privacy and consent handled for patient-generated content?"],
  },
  {
    id: "systems",
    label: "PV systems and interoperability",
    rules: [/\binteroperab/, /\bidmp\b/, /\bhl7\b|\bfhir\b/, /\bsafety databases?\b/, /\bpharmacovigilance systems?\b/, /\bdata standards?\b/, /\bcomputeri[sz]ed system validation\b/],
    business: "Could affect system choices, vendor requirements and how data moves between partners and regulators.",
    technical: "Relates to data standards (E2B R3, IDMP, FHIR), integration architecture and system validation.",
    explore: ["Which standard versions were used, and was exchange tested with a real partner or regulator gateway?"],
  },
];

export const METHODS = [
  { id: "nlp", technical: "Text extraction needs annotated examples from your own case data to confirm performance before use.", label: "NLP and information extraction", rules: [/\bnatural language processing\b/, /\bnlp\b/, /\binformation extraction\b/, /\bnamed entity recognition\b/, /\btext mining\b/, /\btext classification\b/] },
  { id: "llm", technical: "Language models need version pinning, prompt and output logging, and checks for invented content before any regulated use.", label: "Large language models", rules: [/\blarge language models?\b/, /\bllms?\b/, /\bgpt-?\d/, /\bchatgpt\b/, /\bgenerative (ai|artificial intelligence)\b/, /\b(llama|claude|gemini|mistral)\b/, /\bprompt(ing| engineering)\b/] },
  { id: "rag", technical: "Retrieval quality depends on the document store; sources behind each answer should be logged and shown.", label: "Retrieval-augmented generation", rules: [/\bretrieval[- ]augmented\b/, /\brag\b/] },
  { id: "agents", technical: "Multi-step automated agents need clear limits on what they may change, and a human checkpoint before regulated outputs.", label: "Agent-based systems", rules: [/\b(ai|llm|autonomous|multi-?agent) agents?\b/, /\bagentic\b/, /\bmulti-?agent\b/] },
  { id: "ml", technical: "Trained models need monitoring for drift as reporting patterns, products and dictionaries change.", label: "Machine learning and statistical methods", rules: [/\bmachine learning\b/, /\bdeep learning\b/, /\bneural networks?\b/, /\brandom forests?\b/, /\bgradient boosting\b|\bxgboost\b/, /\bbayesian\b/, /\bclassifiers?\b/, /\bbert\b|\bbiobert\b|\btransformer models?\b/] },
  { id: "causal", technical: "Causal methods depend on study design and data assumptions that should be documented and reviewed.", label: "Causal inference", rules: [/\bcausal (inference|effect|analysis)\b/, /\bpropensity scores?\b/, /\btarget trial emulation\b/, /\binstrumental variables?\b/, /\bself-controlled\b/, /\bcausality assessment\b/] },
  { id: "kg", technical: "Knowledge graphs need curated sources and a process to keep relationships current.", label: "Knowledge graphs", rules: [/\bknowledge graphs?\b/, /\bontolog(y|ies)\b/, /\bgraph neural networks?\b/, /\blink prediction\b/] },
  { id: "multimodal", technical: "Document processing depends on source quality (scans, handwriting, tables) and needs fallbacks for unreadable input.", label: "Multimodal document processing", rules: [/\bmultimodal\b/, /\boptical character recognition\b|\bocr\b/, /\bscanned (documents?|forms?)\b/, /\bdocument (processing|understanding)\b/] },
  { id: "privacy", technical: "Privacy approaches need to be checked against data protection requirements for personal health data.", label: "Privacy-preserving approaches", rules: [/\bprivacy[- ]preserving\b/, /\bfederated (learning|analysis)\b/, /\bde-?identification\b/, /\bdifferential privacy\b/, /\banonymi[sz]ation\b/] },
  { id: "evaluation", technical: "Evaluation and oversight designs can be reused when validating systems under GxP and GVP expectations.", label: "Evaluation, validation, and human oversight", rules: [/\bhuman[- ]in[- ]the[- ]loop\b/, /\bhuman oversight\b/, /\bvalidation framework\b/, /\bgood machine learning practice\b/, /\bevaluation framework\b/, /\binter-?rater\b|\bagreement with (human|expert)\b/, /\bexplainab/] },
];

// A paper qualifies only if it is about drug safety. General healthcare AI papers
// are dropped unless they say how they relate to PV.
const PV_TERMS = [
  /\bpharmacovigilance\b/, /\bdrug safety\b/, /\bmedicines? safety\b/, /\bvaccine safety\b/,
  /\badverse (drug )?(events?|reactions?|effects?)\b/, /\badrs?\b/, /\bsafety signals?\b/, /\bsignal detection\b/,
  /\bfaers\b/, /\bvaers\b/, /\bvigibase\b/, /\beudravigilance\b/, /\bspontaneous report/, /\bindividual case safety\b/,
  /\bpost-?marketing (safety|surveillance)\b/, /\bdrug-induced\b/, /\bdisproportionality\b/,
];

const hits = (rules, hay) => {
  const words = [];
  for (const r of rules) {
    const m = hay.match(r);
    if (m && !words.includes(m[0])) words.push(m[0]);
  }
  return words;
};

export const paperText = (p) => `${p.title}. ${p.keywords?.join("; ") ?? ""}. ${p.abstract ?? ""}`.toLowerCase();

// Returns the triggering words when a paper is about drug safety, else null.
export function pvRelevance(text) {
  const words = hits(PV_TERMS, text);
  return words.length ? words.slice(0, 3) : null;
}

// Both tag dimensions, with the words that matched each tag.
export function tagPaper(text) {
  const tag = (list) =>
    list.map((t) => ({ id: t.id, words: hits(t.rules, text) })).filter((t) => t.words.length).map((t) => ({ id: t.id, why: t.words.slice(0, 3) }));
  return { applications: tag(APPLICATIONS), methods: tag(METHODS) };
}

export const taxonomy = () => ({
  version: TAXONOMY_VERSION,
  applications: APPLICATIONS.map(({ rules, ...t }) => t),
  methods: METHODS.map(({ rules, ...t }) => t),
});
