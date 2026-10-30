import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitSentences, abstractParts, classifySentences, assessMaturity, idfTable, textRank } from "../scripts/research-extract.mjs";
import { pvRelevance, tagPaper } from "../scripts/research-taxonomy.mjs";
import { publicationType, statusNotes, dedupe, collectResearch, parsePubmed } from "../scripts/research.mjs";
import * as R from "../public/research-lib.js";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/research");

async function build() {
  const out = path.join(await mkdtemp(path.join(tmpdir(), "pvr-")), "research.json");
  await collectResearch({ fixturesDir: FIX, out, env: { NCBI_EMAIL: "test@example.org" }, now: new Date("2026-10-30T12:00:00Z") });
  return JSON.parse(await readFile(out, "utf8"));
}

test("splits sentences without breaking on abbreviations or decimals", () => {
  assert.deepEqual(splitSentences("We used BERT, e.g. BioBERT. F1 was 0.91 vs. 0.85 for rules. Done."), ["We used BERT, e.g. BioBERT.", "F1 was 0.91 vs. 0.85 for rules.", "Done."]);
});

test("reads Europe PMC headings and PubMed-style plain headings", () => {
  assert.deepEqual(abstractParts("<h4>Methods</h4>We did X. <h4>Results</h4>It worked.").map((p) => p.label), ["Methods", "Results"]);
  assert.deepEqual(abstractParts("BACKGROUND: Some. METHODS: We did. CONCLUSIONS: Fine.").map((p) => p.label), ["BACKGROUND", "METHODS", "CONCLUSIONS"]);
});

test("files sentences under sections and spots metric sentences", () => {
  const { structured, sentences } = classifySentences("Duplicates are common. We aimed to assess a classifier. We used 500 pairs. The classifier achieved an F1 of 0.9. A limitation is the single site. In conclusion, it may help.");
  assert.equal(structured, false);
  assert.deepEqual(sentences.map((s) => s.section), ["background", "question", "approach", "findings", "limitations", "conclusion"]);
  assert.equal(sentences[3].metric, true);
});

test("maturity cites its evidence and ignores hedged mentions", () => {
  const s = (text, section = "findings") => ({ text, section, n: 1, metric: /\d/.test(text) });
  assert.equal(assessMaturity([s("The tool was deployed in routine case processing.")], "article").id, "operational");
  assert.equal(assessMaturity([s("Future work should include external validation.", "conclusion"), s("Recall was 95%.")], "article").id, "experimental");
  assert.equal(assessMaturity([s("We propose a framework for agents.", "approach")], "article").id, "concept");
  assert.equal(assessMaturity([s("Recall was 95%.")], "review").id, "na");
  assert.match(assessMaturity([s("The tool was deployed in routine case processing.")], "article").quote, /deployed/);
});

test("TextRank returns sentence indexes in reading order", () => {
  const sents = ["Signal detection in pharmacovigilance.", "Unrelated sentence about weather.", "Machine learning improves signal detection in pharmacovigilance."];
  const idx = textRank(sents, idfTable(sents), 2);
  assert.equal(idx.length, 2);
  assert.ok(idx[0] < idx[1]);
});

test("PV relevance gate and two-dimension tags", () => {
  assert.equal(pvRelevance("machine learning for bed occupancy"), null);
  assert.ok(pvRelevance("signal detection in faers"));
  const t = tagPaper("large language models for literature screening of individual case safety reports");
  assert.deepEqual(t.applications.map((x) => x.id).sort(), ["intake", "literature"]);
  assert.deepEqual(t.methods.map((x) => x.id), ["llm"]);
});

test("publication types and retraction notes", () => {
  assert.equal(publicationType({ preprint: true }), "preprint");
  assert.equal(publicationType({ pubTypes: ["Review"] }), "review");
  assert.equal(publicationType({ pubTypes: ["Journal Article"], title: "A scoping review of X" }), "review");
  assert.equal(publicationType({ pubTypes: ["Retraction of Publication"] }), "notice");
  assert.deepEqual(statusNotes(["Retracted Publication"], [{ type: "Retraction in" }]), [{ type: "retracted" }]);
  assert.deepEqual(statusNotes([], [{ type: "Erratum in", ref: "MED:1" }]), [{ type: "corrected", ref: "MED:1" }]);
});

test("dedupe merges records sharing a DOI and keeps the labelled PubMed abstract", async () => {
  const pub = parsePubmed(await readFile(path.join(FIX, "pubmed.xml"), "utf8"));
  const epmc = { ...pub[0], source: "europepmc", abstract: "Unlabelled text.", ids: { doi: "10.1000/test.duplicates", pmid: null, epmc: "MED:39000002" } };
  const out = dedupe([epmc, pub[0]]);
  assert.equal(out.length, 1);
  assert.equal(out[0].ids.pmid, "39000002");
  assert.ok(Array.isArray(out[0].abstract));
});

test("fixture build: one record per paper, labelled statuses, linked versions, honest source health", async () => {
  const d = await build();
  const titles = d.papers.map((p) => p.title);
  assert.ok(!titles.some((t) => /bed occupancy/.test(t)), "non-PV paper is dropped");
  assert.equal(d.papers.filter((p) => p.ids.doi === "10.1000/test.duplicates").length, 1, "duplicate DOI appears once");
  const pre = d.papers.find((p) => p.type === "preprint");
  assert.equal(pre.peerReview, "preprint");
  assert.equal(pre.family[0].relation, "published as");
  assert.ok(d.papers.find((p) => /causality/.test(p.title)).status.some((s) => s.type === "retracted"));
  for (const p of d.papers) {
    assert.ok(R.primaryLink(p), `${p.title} has an original-source link`);
    assert.ok(p.maturity.reason, "every maturity label has a reason");
    if (!p.openAccess) {
      assert.equal(p.abstract, undefined, "closed abstracts are not republished");
      for (const list of Object.values(p.sections)) assert.ok(list.length <= 1);
    }
  }
  const llm = d.papers.find((p) => /literature screening/.test(p.title));
  assert.ok(llm.abstract, "open-access abstract is kept");
  assert.ok(llm.sections.findings.some((s) => /97\.1%/.test(s.text)), "metric sentence kept verbatim");
  assert.deepEqual(d.sources.map((s) => [s.id, s.ok]), [["europepmc", true], ["pubmed", true]]);
  assert.ok(d.taxonomy.applications[0].business, "taxonomy carries relevance text for the page");
});

test("PubMed stays off without NCBI_EMAIL and says so", async () => {
  const { sourceList } = await import("../scripts/research.mjs");
  const pm = sourceList({}).find((s) => s.id === "pubmed");
  assert.equal(pm.configured, false);
  assert.match(pm.note, /NCBI_EMAIL/);
});

test("research filters, watchlist and citations", async () => {
  const d = await build();
  const now = Date.parse("2026-10-30T12:00:00Z");
  const all = d.papers.filter((p) => R.matchesPaper(p, {}, now));
  assert.ok(!all.some((p) => p.type === "preprint"), "preprint with a journal version is folded in by default");
  assert.ok(d.papers.filter((p) => R.matchesPaper(p, { type: "preprint" }, now)).length === 1);
  assert.ok(d.papers.filter((p) => R.matchesPaper(p, { app: "literature" }, now)).every((p) => p.tags.applications.some((t) => t.id === "literature")));
  assert.equal(d.papers.filter((p) => R.matchesPaper(p, { q: "record linkage" }, now)).length, 1);

  const store = { v: null, getItem() { return this.v; }, setItem(_, v) { this.v = v; } };
  const w = R.loadWatch(store);
  const p = all[0];
  assert.equal(R.toggleSaved(w, p, "2026-10-30T00:00:00Z"), true);
  R.setNote(w, p, "check recall");
  R.toggleTopic(w, p.tags.applications[0].id);
  R.saveWatch(w, store);
  const again = R.loadWatch(store);
  assert.equal(again.saved[p.id].note, "check recall", "saved papers persist across reloads");
  assert.ok(R.followedMatch(again, p));

  R.startVisit(again, "2026-10-29T00:00:00Z");
  R.startVisit(again, "2026-10-31T00:00:00Z");
  assert.equal(again.prevVisit, "2026-10-29T00:00:00Z");
  assert.ok(R.isNew(again, p));
  R.startVisit(again, "2026-10-31T00:30:00Z");
  assert.equal(again.prevVisit, "2026-10-29T00:00:00Z", "a visit within the hour doesn't move the marker");

  const ris = R.ris([p]);
  assert.match(ris, /^TY {2}- JOUR/);
  assert.match(ris, /ER {2}- \r\n$/);
  assert.match(R.citation(p), /\(2026\)/);
});
