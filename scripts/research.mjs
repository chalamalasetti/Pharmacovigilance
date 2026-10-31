import { withoutPersonalFields, unsafeNarrative } from "../public/privacy.js";
// Collects PV research for the Research & Innovation section and writes
// public/data/research.json. Sources are Europe PMC (all of PubMed plus the
// medRxiv/bioRxiv preprints, no key needed) and, when NCBI_EMAIL is set, PubMed's
// E-utilities directly. Everything runs at build time with no paid service:
// tags come from research-taxonomy.mjs, sections and summaries from
// research-extract.mjs. Records are untrusted text: they are only ever stored
// and shown as text, never followed as instructions.
//
//   node scripts/research.mjs                   # fetch (at most every 6 hours; RESEARCH_FORCE=1 to force)
//   node scripts/research.mjs --fixtures DIR    # read DIR/europepmc.json and DIR/pubmed.xml instead

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { pvRelevance, tagPaper, paperText, taxonomy, TAXONOMY_VERSION } from "./research-taxonomy.mjs";
import { classifySentences, textRank, idfTable, vector, cosine, assessMaturity } from "./research-extract.mjs";
import { cloudConfig } from "./cloud.mjs";
import { reviewFromRow } from "../public/research-lib.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/data/research.json");
const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance-info.vercel.app").replace(/\/$/, "");
const UA = "PVInfo/0.1 (+https://github.com/chalamalasetti/Pharmacovigilance)";
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_LOOKBACK_DAYS = 365;
const LOOKBACK_DAYS = 45;
const KEEP_DAYS = 3 * 365;
const MAX_PAPERS = 2000;
const PAGE = 100;
const MAX_PAGES = 2;
export const METHOD = "rules-v1";

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (v == null ? "" : typeof v === "object" ? String(v["#text"] ?? "") : String(v));
const clean = (s) =>
  String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&(amp|quot|apos|#39|lt|gt|nbsp);/g, (m, e) => ({ amp: "&", quot: '"', apos: "'", "#39": "'", lt: "<", gt: ">", nbsp: " " })[e])
    .replace(/\s+/g, " ")
    .trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (d) => d.toISOString().slice(0, 10);

async function get(url, accept = "application/json") {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ---- Publication type and status ----

// One of article, preprint, review, conference, commentary or notice.
export function publicationType({ preprint, pubTypes = [], title = "" }) {
  const t = pubTypes.map((x) => String(x).toLowerCase());
  if (t.some((x) => /retraction of publication|published erratum|correction|expression of concern/.test(x))) return "notice";
  if (preprint || t.includes("preprint")) return "preprint";
  if (t.some((x) => /review|meta-analysis/.test(x)) || /\b(systematic|scoping|narrative|literature) review\b|\bmeta-analysis\b/i.test(title)) return "review";
  if (t.some((x) => /congress|conference|meeting abstract/.test(x))) return "conference";
  if (t.some((x) => /^(editorial|comment|letter|news|interview|biography)$/.test(x))) return "commentary";
  return "article";
}

// Retraction, correction and concern notes, from publication types and comment links.
export function statusNotes(pubTypes = [], comments = []) {
  const notes = [];
  if (pubTypes.some((x) => /retracted publication/i.test(x))) notes.push({ type: "retracted" });
  for (const c of comments) {
    const type = String(c.type || "").toLowerCase().replace(/\s+/g, "");
    const ref = c.ref || null;
    if (/retractionin/.test(type) && !notes.some((n) => n.type === "retracted")) notes.push({ type: "retracted", ref });
    else if (/(erratumin|correctionin|correctedandrepublishedin)/.test(type)) notes.push({ type: "corrected", ref });
    else if (/expressionofconcernin/.test(type)) notes.push({ type: "concern", ref });
  }
  return notes;
}

// ---- Europe PMC ----

export function fromEuropePmc(r) {
  const preprint = r.source === "PPR";
  const pubTypes = asArray(r.pubTypeList?.pubType);
  const comments = asArray(r.commentCorrectionList?.commentCorrection).map((c) => ({ type: c.type, ref: c.id ? `${c.source || "MED"}:${c.id}` : null, note: c.reference }));
  const fullText = asArray(r.fullTextUrlList?.fullTextUrl);
  const license = String(r.license || "").toLowerCase();
  const title = clean(r.title).replace(/\.$/, "");
  return {
    title,
    venue: clean(r.journalInfo?.journal?.title || r.bookOrReportDetails?.publisher || (preprint ? "Preprint server" : "")),
    published: r.firstPublicationDate || r.electronicPublicationDate || (r.pubYear ? `${r.pubYear}-01-01` : null),
    preprint,
    pubTypes,
    comments,
    ids: { doi: r.doi?.toLowerCase() || null, pmid: r.pmid || null, pmcid: r.pmcid || null, epmc: r.id ? `${r.source}:${r.id}` : null },
    keywords: asArray(r.keywordList?.keyword).map(clean).filter(Boolean).slice(0, 12),
    abstract: r.abstractText || "",
    openAccess: r.isOpenAccess === "Y" || license.startsWith("cc"),
    license: license || null,
    fullTextUrl: fullText.find((f) => /^(OA|F)$/.test(f.availabilityCode))?.url ?? null,
    source: "europepmc",
  };
}

async function fetchEuropePmc(queries, from, to) {
  const out = [];
  for (const q of queries) {
    let cursor = "*";
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = `(${q.europepmc}) AND FIRST_PDATE:[${from} TO ${to}]`;
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&resultType=core&format=json&pageSize=${PAGE}&cursorMark=${encodeURIComponent(cursor)}`;
      const data = JSON.parse(await get(url));
      const results = asArray(data.resultList?.result);
      out.push(...results.map(fromEuropePmc));
      if (results.length < PAGE || !data.nextCursorMark || data.nextCursorMark === cursor) break;
      cursor = data.nextCursorMark;
      await sleep(300);
    }
    await sleep(300);
  }
  return out;
}

// ---- PubMed E-utilities ----

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text", stopNodes: ["*.AbstractText", "*.ArticleTitle"] });

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function pubmedDate(article) {
  const ad = asArray(article.ArticleDate)[0];
  const pd = article.Journal?.JournalIssue?.PubDate ?? {};
  const y = text(ad?.Year) || text(pd.Year) || text(pd.MedlineDate).slice(0, 4);
  if (!y) return null;
  const mRaw = text(ad?.Month) || text(pd.Month) || "1";
  const m = Number(mRaw) || MONTHS[mRaw.slice(0, 3).toLowerCase()] || 1;
  const d = Number(text(ad?.Day) || text(pd.Day)) || 1;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parsePubmed(body) {
  const doc = xml.parse(body);
  return asArray(doc.PubmedArticleSet?.PubmedArticle).map((pa) => {
    const mc = pa.MedlineCitation ?? {};
    const a = mc.Article ?? {};
    const ids = Object.fromEntries(asArray(pa.PubmedData?.ArticleIdList?.ArticleId).map((i) => [i["@IdType"], text(i)]));
    const pubTypes = asArray(a.PublicationTypeList?.PublicationType).map(text);
    const comments = asArray(mc.CommentsCorrectionsList?.CommentsCorrections).map((c) => ({ type: c["@RefType"], ref: c.PMID ? `MED:${text(c.PMID)}` : null, note: text(c.RefSource) }));
    const abstract = asArray(a.Abstract?.AbstractText).map((t) => ({ label: typeof t === "object" ? t["@Label"] || "" : "", text: clean(text(t)) }));
    return {
      title: clean(text(a.ArticleTitle)).replace(/\.$/, ""),
      venue: clean(text(a.Journal?.Title)),
      published: pubmedDate(a),
      preprint: pubTypes.includes("Preprint"),
      pubTypes,
      comments,
      ids: { doi: ids.doi?.toLowerCase() || null, pmid: text(mc.PMID) || ids.pubmed || null, pmcid: ids.pmc || null, epmc: null },
      keywords: asArray(mc.KeywordList?.Keyword).map((k) => clean(text(k))).filter(Boolean).slice(0, 12),
      abstract,
      openAccess: false,
      license: null,
      fullTextUrl: null,
      source: "pubmed",
    };
  });
}

async function fetchPubmed(queries, from, to, { email, apiKey }) {
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const who = `tool=pvinfo&email=${encodeURIComponent(email)}${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ""}`;
  const gap = apiKey ? 150 : 400; // stays under NCBI's 3 (or 10 with a key) requests per second
  const pmids = new Set();
  for (const q of queries) {
    const url = `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${PAGE * MAX_PAGES}&datetype=pdat&mindate=${from.replace(/-/g, "/")}&maxdate=${to.replace(/-/g, "/")}&term=${encodeURIComponent(q.pubmed)}&${who}`;
    for (const id of JSON.parse(await get(url)).esearchresult?.idlist ?? []) pmids.add(id);
    await sleep(gap);
  }
  const ids = [...pmids];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(...parsePubmed(await get(`${base}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.slice(i, i + 200).join(",")}&${who}`, "application/xml")));
    await sleep(gap);
  }
  return out;
}

// ---- Building papers ----

export const paperId = (ids) => createHash("sha1").update(ids.doi ? `doi:${ids.doi}` : ids.pmid ? `pmid:${ids.pmid}` : String(ids.epmc)).digest("hex").slice(0, 10);

// One record per paper: records sharing a DOI, PMID or Europe PMC id are the same
// paper (Europe PMC's copy wins; PubMed fills gaps such as a labelled abstract).
export function dedupe(records) {
  const byKey = new Map();
  const out = [];
  const keys = (r) => [r.ids.doi && `doi:${r.ids.doi}`, r.ids.pmid && `pmid:${r.ids.pmid}`, r.ids.epmc && `epmc:${r.ids.epmc}`].filter(Boolean);
  for (const r of records) {
    const hit = keys(r).map((k) => byKey.get(k)).find(Boolean);
    if (!hit) {
      const copy = { ...r, ids: { ...r.ids } };
      out.push(copy);
      for (const k of keys(copy)) byKey.set(k, copy);
      continue;
    }
    for (const [k, v] of Object.entries(r.ids)) hit.ids[k] ??= v;
    if (Array.isArray(r.abstract) && r.abstract.length > 1 && !/<h\d|[A-Z]{4,}:/.test(String(hit.abstract))) hit.abstract = r.abstract;
    if (!hit.abstract || (Array.isArray(hit.abstract) && !hit.abstract.length)) hit.abstract = r.abstract;
    for (const f of ["venue", "published", "fullTextUrl", "license"]) hit[f] ||= r[f];
    hit.pubTypes = [...new Set([...hit.pubTypes, ...r.pubTypes])];
    hit.comments = [...hit.comments, ...r.comments];
    hit.openAccess ||= r.openAccess;
    for (const k of keys(hit)) byKey.set(k, hit);
  }
  return out;
}

const pick = (list, n) => list.slice(0, n).map(({ text, n: ref, label }) => ({ text, ref, ...(label && { label }) }));

// Abstracts belong to their publishers. Open-access papers show the whole
// abstract; for others the page quotes at most one sentence per section and links out.
export function buildPaper(raw, idf, now = new Date().toISOString()) {
  if (unsafeNarrative(JSON.stringify(raw.abstract)) || unsafeNarrative(raw.title)) return null;
  const r = withoutPersonalFields(raw);
  const abstractText = Array.isArray(r.abstract) ? r.abstract.map((p) => `${p.label ? `${p.label}: ` : ""}${p.text}`).join(" ") : clean(r.abstract);
  const hay = paperText({ title: r.title, keywords: r.keywords, abstract: abstractText });
  const relevance = pvRelevance(hay);
  if (!relevance) return null;
  const type = publicationType(r);
  const { structured, sentences } = classifySentences(r.abstract);
  const per = r.openAccess ? 4 : 1;
  const sectionList = (id) => {
    const list = sentences.filter((s) => s.section === id);
    // Findings with numbers first, so the metric and its context survive the cut.
    if (id === "findings") list.sort((a, b) => b.metric - a.metric || a.n - b.n);
    return pick(list, per).sort((a, b) => a.ref - b.ref);
  };
  const sections = {};
  for (const id of ["question", "approach", "findings", "limitations", "conclusion"]) {
    const list = sectionList(id);
    if (list.length) sections[id] = list;
  }
  if (!sections.question) {
    const bg = sentences.filter((s) => s.section === "background");
    if (bg.length) sections.question = pick(bg.slice(-1), 1);
  }
  const central = textRank(sentences.map((s) => s.text), idf, 2).map((i) => sentences[i]);
  const ids = r.ids;
  const notes = statusNotes(r.pubTypes, r.comments);
  const [epmcSource, epmcId] = (ids.epmc || "").split(":");
  return {
    id: paperId(ids),
    title: r.title,
    venue: r.venue || null,
    published: r.published ? r.published.slice(0, 10) : null,
    type,
    peerReview: type === "preprint" ? "preprint" : "journal",
    ...(notes.length && { status: notes }),
    ids: Object.fromEntries(Object.entries(ids).filter(([, v]) => v)),
    links: {
      ...(ids.doi && { doi: `https://doi.org/${ids.doi}` }),
      ...(ids.pmid && { pubmed: `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/` }),
      ...(ids.pmcid && { pmc: `https://pmc.ncbi.nlm.nih.gov/articles/${ids.pmcid}/` }),
      ...(epmcId && { europepmc: `https://europepmc.org/article/${epmcSource}/${epmcId}` }),
      ...(r.fullTextUrl && { fulltext: r.fullTextUrl }),
    },
    openAccess: Boolean(r.openAccess),
    ...(r.license && { license: r.license }),
    keywords: r.keywords,
    relevance,
    tags: tagPaper(hay),
    hasAbstract: sentences.length > 0,
    structured,
    summary: pick(central, 2),
    sections,
    ...(r.openAccess && abstractText && { abstract: abstractText }),
    maturity: assessMaturity(sentences, type),
    sources: [r.source],
    method: METHOD,
    taxonomy: TAXONOMY_VERSION,
    firstSeen: now,
  };
}

// The text used to compare papers: what is kept on the page, so stored papers compare the same way.
const compareText = (p) => [p.title, (p.keywords ?? []).join(" "), ...p.summary.map((s) => s.text), ...Object.values(p.sections).flat().map((s) => s.text)].join(" ");

// Keeps explicit version links and lists related papers without retaining author names.
export function linkPapers(papers) {
  const idf = idfTable(papers.map(compareText));
  const vecs = new Map(papers.map((p) => [p.id, vector(compareText(p), idf)]));
  // Preserve only explicit identifier-backed version relationships. Title similarity
  // contributes to related papers below; it cannot prove publication identity.
  for (const p of papers) {
    const family = (p.family ?? []).filter((f) => f.how === "source identifier");
    if (family.length) p.family = family; else delete p.family;
  }
  const seen = new Set(papers.map((p) => p.id));
  for (const p of papers) {
    const fam = new Set((p.family ?? []).map((f) => f.id));
    p.related = papers
      .filter((q) => q.id !== p.id && !fam.has(q.id) && seen.has(q.id))
      .map((q) => ({ id: q.id, s: cosine(vecs.get(p.id), vecs.get(q.id)) }))
      .filter((x) => x.s >= 0.25)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map((x) => x.id);
  }
  return papers;
}

// ---- Run ----

async function previous(out) {
  try {
    return JSON.parse(await readFile(out, "utf8"));
  } catch {}
  if (process.env.SKIP_PREVIOUS) return null;
  try {
    return JSON.parse(await get(`${SITE_URL}/data/research.json`));
  } catch {
    return null;
  }
}

export function sourceList(env = process.env) {
  return [
    { id: "europepmc", name: "Europe PMC (includes PubMed and preprints)", configured: true },
    { id: "pubmed", name: "PubMed (NCBI E-utilities)", configured: Boolean(env.NCBI_EMAIL), note: env.NCBI_EMAIL ? null : "Off until NCBI_EMAIL is set. PubMed records still arrive through Europe PMC." },
  ];
}

// ---- Editor reviews and official guidance (applied on every build) ----

// Reviews from the admin queue (supabase/schema.sql). Public columns only, so the
// reviewer's email and notes never reach the site.
export async function fetchReviews(cfg = cloudConfig(), fetchImpl = fetch) {
  const key = cfg.serviceKey || cfg.publicKey;
  if (!cfg.url || !key) return null;
  const cols = "paper_id,tags,summary_status,relevance,maturity,version_of,reviewed_at";
  const res = await fetchImpl(`${cfg.url}/rest/v1/research_reviews?select=${cols}`, {
    headers: { apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }) },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`reviews HTTP ${res.status}`);
  return res.json();
}

// Stores each paper's review next to its automated fields, which stay untouched,
// so a review can be changed or removed later. The pages apply it (research-lib.js).
export function attachReviews(papers, reviews) {
  const byId = new Map((reviews ?? []).map((r) => [r.paper_id, r]));
  for (const p of papers) {
    delete p.review;
    const r = byId.get(p.id);
    if (!r) continue;
    p.review = reviewFromRow(r);
  }
  return papers;
}

const GUIDANCE_CATEGORIES = new Set(["guideline", "regulation"]);
// Signal and real-world-evidence words appear in most safety notices, so on their
// own they don't make a regulator update relevant to research topics.
const GUIDANCE_ONLY_APPS = new Set(["signal", "rwe"]);

// Regulator guidance and regulation from the updates feed that touches a research
// topic, for the timeline. Kept across builds, since the feed covers only 60 days.
export function guidanceEvents(updates, previous = [], now = new Date()) {
  const byId = new Map(previous.map((g) => [g.id, g]));
  for (const u of updates ?? []) {
    if (u.kind !== "official" || !(GUIDANCE_CATEGORIES.has(u.category) || u.tags?.some((t) => GUIDANCE_CATEGORIES.has(t)))) continue;
    const tags = tagPaper(`${u.title}. ${u.summary ?? ""}`.toLowerCase());
    tags.applications = tags.applications.filter((t) => !GUIDANCE_ONLY_APPS.has(t.id) || tags.methods.length);
    if (!tags.applications.length && !tags.methods.length) continue;
    byId.set(u.id, { id: u.id, title: u.title, link: u.link, source: u.agency ? `${u.agency} (${u.source})` : u.source, published: u.published?.slice(0, 10) ?? null, tags });
  }
  const cutoff = day(new Date(now - KEEP_DAYS * 86400000));
  return [...byId.values()].filter((g) => !g.published || g.published >= cutoff).sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "")).slice(0, 300);
}

async function finish(raw, out, { fixturesDir, env, updatesFile }) {
  const data = withoutPersonalFields(raw);
  if (!fixturesDir) {
    try {
      const reviews = await fetchReviews(cloudConfig(env));
      if (reviews) {
        attachReviews(data.papers, reviews);
        console.log(`research: applied ${reviews.length} editor reviews`);
      }
    } catch (e) {
      // Keep the reviews from the last build rather than dropping them.
      console.warn(`research: reviews unavailable (${e.message}); keeping the previous ones`);
    }
  }
  try {
    const updates = JSON.parse(await readFile(updatesFile ?? path.join(path.dirname(out), "updates.json"), "utf8")).updates;
    data.guidance = guidanceEvents(updates, data.guidance ?? []);
  } catch {}
  data.taxonomy = taxonomy();
  await writeFile(out, JSON.stringify(withoutPersonalFields(data)) + "\n");
}

// Fetches, builds and writes research.json. Returns the number of papers.
export async function collectResearch({ fixturesDir = null, out = OUT, now = new Date(), env = process.env, updatesFile = null } = {}) {
  const prev = fixturesDir ? null : await previous(out);
  if (prev && !env.RESEARCH_FORCE && now - Date.parse(prev.refreshed ?? 0) < REFRESH_EVERY_MS) {
    // Fetched recently: keep the last result (a fresh Vercel build has no file yet, so write it).
    await finish(prev, out, { fixturesDir, env, updatesFile });
    console.log(`research: kept ${prev.papers.length} papers from ${prev.refreshed} (refreshes every 6 hours)`);
    return prev.papers.length;
  }
  const config = JSON.parse(await readFile(path.join(ROOT, "research.json"), "utf8"));
  const from = day(new Date(now - (prev?.papers?.length ? LOOKBACK_DAYS : FIRST_LOOKBACK_DAYS) * 86400000));
  const to = day(now);
  const nowIso = now.toISOString();
  const prevSources = new Map((prev?.sources ?? []).map((s) => [s.id, s]));

  const sources = [];
  const records = [];
  for (const s of sourceList(env)) {
    const status = { ...s, lastAttempt: nowIso, lastSuccess: prevSources.get(s.id)?.lastSuccess ?? null, count: 0, ok: false };
    sources.push(status);
    if (!s.configured) continue;
    try {
      let got;
      if (fixturesDir) {
        const file = path.join(fixturesDir, s.id === "europepmc" ? "europepmc.json" : "pubmed.xml");
        const body = await readFile(file, "utf8");
        got = s.id === "europepmc" ? asArray(JSON.parse(body).resultList?.result).map(fromEuropePmc) : parsePubmed(body);
      } else {
        got = s.id === "europepmc" ? await fetchEuropePmc(config.queries, from, to) : await fetchPubmed(config.queries, from, to, { email: env.NCBI_EMAIL, apiKey: env.NCBI_API_KEY });
      }
      records.push(...got);
      Object.assign(status, { ok: true, lastSuccess: nowIso, count: got.length, error: null });
      console.log(`research: ${s.id} returned ${got.length} records`);
    } catch (e) {
      status.error = "Source collection failed; inspect source availability without logging response content.";
      console.warn(`research: ${s.id} failed: ${status.error}`);
    }
  }

  const merged = dedupe(records);
  const idf = idfTable(merged.map((r) => `${r.title} ${Array.isArray(r.abstract) ? r.abstract.map((p) => p.text).join(" ") : clean(r.abstract)}`));
  const firstSeen = new Map((prev?.papers ?? []).map((p) => [p.id, p.firstSeen]));
  const fresh = merged.map((r) => buildPaper(r, idf, nowIso)).filter(Boolean);
  for (const p of fresh) p.firstSeen = firstSeen.get(p.id) ?? nowIso;

  // Earlier papers stay, so a source outage or a narrower date window never empties the page.
  const byId = new Map((prev?.papers ?? []).map((p) => [p.id, p]));
  for (const p of fresh) byId.set(p.id, { ...byId.get(p.id), ...p, sources: [...new Set([...(byId.get(p.id)?.sources ?? []), ...p.sources])] });
  const cutoff = day(new Date(now - KEEP_DAYS * 86400000));
  const papers = linkPapers(
    [...byId.values()]
      .filter((p) => !p.published || p.published >= cutoff)
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "") || a.title.localeCompare(b.title))
      .slice(0, MAX_PAPERS),
  );

  if (!fixturesDir && !sources.some((s) => s.ok) && prev) {
    // Every source failed: keep the old papers but record the failure.
    await finish({ ...prev, sources }, out, { fixturesDir, env, updatesFile });
    console.warn("research: every source failed; kept the previous papers");
    return prev.papers.length;
  }

  const data = { updated: nowIso, refreshed: nowIso, window: { from, to }, method: METHOD, taxonomy: taxonomy(), sources, papers, guidance: prev?.guidance ?? [] };
  await finish(data, out, { fixturesDir, env, updatesFile });
  console.log(`research: wrote ${papers.length} papers (${fresh.length} from this refresh) to ${path.relative(ROOT, out)}`);
  return papers.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--fixtures");
  collectResearch({ fixturesDir: i > -1 ? path.resolve(process.argv[i + 1]) : null }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
