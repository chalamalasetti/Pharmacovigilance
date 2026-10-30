import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRegistry, holderMatcher, moiety, normName, parseOrangeBook } from "../scripts/registry.mjs";
import { unzip, readXlsx } from "../scripts/zip.mjs";
import { buildIndex, matchText, LABELS } from "../scripts/company-match.mjs";
import { annotateUpdates, matchItems, mergeHistory, buildCompanyData } from "../scripts/companies.mjs";
import * as C from "../public/companies-lib.js";

// Fixtures are synthetic: invented medicines (Synthex, fictivastatin, Samebrand...) held by
// real company names, so the identity rules can be tested. See test/fixtures/companies.
const FIX = path.resolve("test/fixtures/companies");
const manifest = JSON.parse(readFileSync("companies/manifest.json", "utf8"));
const register = JSON.parse(readFileSync("companies/sources.json", "utf8"));
const out = path.join(mkdtempSync(path.join(tmpdir(), "pv-reg-")), "registry.json");
const registry = await buildRegistry({ fixturesDir: FIX, out, now: "2026-10-30T00:00:00.000Z" });
const idx = buildIndex(manifest, registry);
const ids = (list) => list.map((m) => m.id).sort();

// ---- Manifest ----

test("the coverage manifest lists at least 100 companies with unique, stable ids", () => {
  const list = manifest.companies.map((c) => c.id);
  assert.ok(list.length >= 100, `only ${list.length} companies`);
  assert.equal(new Set(list).size, list.length);
  for (const c of manifest.companies) {
    assert.match(c.id, /^[a-z0-9-]+$/);
    assert.ok(c.name && c.country && c.region && c.types?.length, `${c.id} is incomplete`);
    assert.ok(c.mentions?.length && c.holders?.length, `${c.id} needs mentions and holders`);
  }
});

test("manifest cross-references point at real companies, and Merck alone is never a match phrase", () => {
  const known = new Set(manifest.companies.map((c) => c.id));
  for (const c of manifest.companies) {
    if (c.parent) assert.ok(known.has(c.parent.id), `${c.id} parent`);
    for (const d of c.distinctFrom ?? []) assert.ok(manifest.companies.find((x) => x.id === d).distinctFrom.includes(c.id), `${c.id} / ${d} not reciprocal`);
    assert.ok(!c.mentions.includes("Merck"), `${c.id} uses bare "Merck"`);
  }
  for (const a of manifest.ambiguous) for (const id of a.candidates) assert.ok(known.has(id), `${a.term} -> ${id}`);
});

test("no two companies claim the same holder prefix", () => {
  const seen = new Map();
  for (const c of manifest.companies) {
    for (const h of c.holders) {
      const k = normName(h);
      assert.ok(!seen.has(k) || seen.get(k) === c.id, `${h} claimed by ${seen.get(k)} and ${c.id}`);
      seen.set(k, c.id);
    }
  }
});

// ---- Source parsing ----

test("zip and xlsx readers open the fixture downloads", () => {
  assert.ok(unzip(readFileSync(path.join(FIX, "orangebook.zip"))).has("products.txt"));
  const rows = readXlsx(readFileSync(path.join(FIX, "ema.xlsx")));
  assert.equal(rows[2][1], "Name of medicine");
  assert.equal(rows[3][1], "Mockerbitux");
});

test("Orange Book rows group into one record per application with status and date", () => {
  const text = unzip(readFileSync(path.join(FIX, "orangebook.zip"))).get("products.txt").toString("latin1");
  const recs = parseOrangeBook(text);
  const synthex = recs.find((r) => r.authId === "NDA 099001");
  assert.deepEqual(synthex.strengths, ["EQ 10MG BASE", "EQ 20MG BASE"]);
  assert.equal(synthex.date, "2001-01-05");
  assert.equal(synthex.status, "Approved, prescription");
  const old = recs.find((r) => r.authId === "NDA 099003");
  assert.equal(old.status, "Discontinued");
  assert.equal(old.date, "before 1982-01-01");
  assert.deepEqual(recs.find((r) => r.authId === "ANDA 099004").ingredients, ["OXYDEMOCAINE", "PLACEBOTHIAZIDE"]);
});

test("EMA rows: header found below title rows, refused and veterinary medicines left out, both date styles read", () => {
  const ema = registry.products.filter((p) => p.src === "ema-medicines");
  assert.deepEqual(ema.map((p) => p.brand).sort(), ["Exemplic", "Mockerbitux", "Samebrand", "Synthex EU"]);
  assert.equal(ema.find((p) => p.brand === "Mockerbitux").date, "2023-01-01");
  assert.equal(ema.find((p) => p.brand === "Samebrand").date, "2012-03-15");
  assert.equal(ema.find((p) => p.brand === "Synthex EU").status, "Withdrawn");
});

test("salts and hydrates reduce to the active moiety", () => {
  assert.equal(moiety("ATORVASTATIN CALCIUM TRIHYDRATE"), "atorvastatin");
  assert.equal(moiety("Olmesartan medoxomil"), "olmesartan");
  assert.equal(moiety("SODIUM CHLORIDE"), "sodium chloride");
  assert.equal(moiety("insulin glargine"), "insulin glargine");
});

// ---- Identity ----

test("Merck & Co. and Merck KGaA holders never merge; bare Merck links to neither", () => {
  const match = holderMatcher(manifest);
  assert.equal(match("Merck Sharp & Dohme B.V.").id, "merck-co");
  assert.equal(match("MERCK SHARP AND DOHME LLC").id, "merck-co");
  assert.equal(match("Merck Europe B.V.").id, "merck-kgaa");
  assert.equal(match("EMD Serono Inc").id, "merck-kgaa");
  assert.equal(match("Merck"), null);
  assert.equal(match("Merckle GmbH"), null);
});

test("holder prefixes match whole words, and the short Orange Book applicant name is a fallback", () => {
  const match = holderMatcher(manifest);
  assert.equal(match("PFIZER LABORATORIES DIV PFIZER INC").id, "pfizer");
  assert.equal(match("Dr. Reddy's Laboratories Ltd").id, "dr-reddys");
  assert.equal(match("UCBX HOLDINGS"), null);
  assert.equal(match("PAR PHARMACEUTICAL INC", "PAR PHARM").id, "endo");
});

test("each source record keeps its provenance, and unlinked holders are listed for editors", () => {
  for (const p of registry.products) {
    assert.ok(p.src && p.locator && p.holder && p.role, JSON.stringify(p));
    assert.ok(p.url?.startsWith("https://"), `${p.brand} has no source URL`);
  }
  assert.ok(registry.unmapped.some((u) => u.holder === "ACME GENERICS LLC"));
  assert.ok(registry.sources.every((s) => s.ok && s.hash && s.records));
});

test("a failed source keeps its last good rows and is marked stale", async () => {
  const again = await buildRegistry({ out, now: "2026-11-06T00:00:00.000Z", fetchImpl: async () => { throw new Error("HTTP 503"); } });
  assert.equal(again.products.length, registry.products.length);
  assert.ok(again.sources.every((s) => !s.ok && s.stale && s.lastSuccess === "2026-10-30T00:00:00.000Z"));
});

// ---- Matching ----

test("a shared ingredient matches every holder, each told it is not the only one", () => {
  const m = matchText(idx, "FDA warns of liver injury with fictivastatin", { country: "US" });
  assert.deepEqual(ids(m), ["merck-co", "teva"]);
  for (const x of m) {
    assert.equal(x.lane, "substance");
    assert.match(x.reason, /1 other company in the registry also holds it/);
  }
});

test("a brand held by different companies in different markets is not a direct match without context", () => {
  assert.deepEqual(matchText(idx, "Samebrand shortage reported", { country: "DE" }), []);
  const named = matchText(idx, "Pfizer recalls Samebrand capsules", { country: "US" });
  assert.equal(named.find((x) => x.id === "pfizer").lane, "direct");
  assert.equal(named.find((x) => x.id === "pfizer").label, LABELS.supported);
  assert.ok(!named.some((x) => x.id === "sanofi"));
});

test("a unique brand alone is a possible match that needs review", () => {
  const [m] = matchText(idx, "New warning for Mockerbitux", { country: "EU" });
  assert.equal(m.id, "merck-kgaa");
  assert.equal(m.label, LABELS.possible);
  assert.ok(!m.outside);
});

test("an authorisation number is a direct identifier match", () => {
  const [m] = matchText(idx, "Article 20 procedure started for EMEA/H/C/099101", { country: "EU" });
  assert.deepEqual([m.id, m.lane, m.label], ["merck-kgaa", "direct", LABELS.id]);
});

test("an out-of-market notice stays visible, labelled outside the mapped markets", () => {
  const [m] = matchText(idx, "PMDA revises precautions for fictivastatin", { country: "JP", countryName: () => "Japan" });
  assert.ok(m.outside.startsWith("Notice from Japan"));
  assert.match(m.outside, /local applicability is not established/);
});

test("a class notice is indirect topic relevance", () => {
  const [m] = matchText(idx, "Review of GLP-1 receptor agonists and suicidal thoughts", { country: "EU" });
  assert.deepEqual([m.id, m.lane, m.label], ["novo-nordisk", "class", LABELS.topic]);
  assert.match(m.reason, /Indirect/);
});

test("a company named with no product is corporate news, and bare Merck matches nobody", () => {
  assert.deepEqual(matchText(idx, "Pfizer shares rise after earnings", { country: "US" }).map((m) => [m.id, m.lane]), [["pfizer", "corporate"]]);
  assert.deepEqual(matchText(idx, "Merck announces quarterly results", { country: "US" }), []);
  assert.deepEqual(ids(matchText(idx, "Merck KGaA opens a new plant", { country: "DE" })), ["merck-kgaa"]);
  assert.deepEqual(ids(matchText(idx, "MSD wins approval in Japan", { country: "JP" })), ["merck-co"]);
});

test("research wording never implies fault or causality", () => {
  const [m] = matchText(idx, "Hepatotoxicity signals for fictivastatin in a cohort study", { kind: "paper" });
  assert.match(m.reason, /does not establish company fault or product causality/);
});

test("matching again does not duplicate history; items that left the feed keep their old reasons", () => {
  const updates = [
    { id: "u1", title: "FDA warns of liver injury with fictivastatin", link: "https://x/1", source: "FDA", country: "US", category: "safety", kind: "official", published: "2026-10-29T00:00:00Z" },
    { id: "u2", title: "Pfizer shares rise", link: "https://x/2", source: "News", country: "US", category: "news", kind: "news", published: "2026-10-28T00:00:00Z" },
  ];
  const first = mergeHistory(matchItems(idx, updates, []), [], new Date("2026-10-30"));
  const second = mergeHistory(matchItems(idx, updates, []), first, new Date("2026-10-30"));
  assert.equal(second.length, first.length);
  const later = mergeHistory(matchItems(idx, [updates[1]], []), second, new Date("2026-10-31"));
  assert.ok(later.find((x) => x.id === "u1").co.length === 2);
  annotateUpdates(updates, idx);
  assert.deepEqual(updates[0].co, [{ id: "merck-co", lane: "substance" }, { id: "teva", lane: "substance" }]);
});

// ---- Public pages ----

test("company data holds public fields only, and says when products are not mapped", () => {
  const history = mergeHistory(matchItems(idx, [{ id: "u1", title: "fictivastatin warning", link: "https://x/1", source: "FDA", country: "US", category: "safety", kind: "official", published: "2026-10-29T00:00:00Z" }], []), [], new Date("2026-10-30"));
  const d = buildCompanyData({ manifest, register, registry, history, now: "2026-10-30T00:00:00Z" });
  assert.equal(d.index.companies.length, manifest.companies.length);
  const text = JSON.stringify([d.index, d.products, [...d.files.values()]]);
  for (const word of ["team_id", "portfolio", "assess", "assign", "email", "notes"]) assert.ok(!text.includes(`"${word}`), `public data contains ${word}`);
  const lilly = d.files.get("eli-lilly");
  assert.equal(lilly.coverage.status, "not-mapped");
  assert.match(lilly.coverage.note, /not a statement that the company has no products/);
  const merck = d.files.get("merck-co");
  assert.equal(merck.updates[0].shared, 2);
  assert.deepEqual(merck.profile.distinctFrom, [{ id: "merck-kgaa", name: "Merck KGaA (EMD)" }]);
  const sub = d.products.terms.find((t) => t.n === "fictivastatin");
  assert.deepEqual(sub.c.map(([id]) => id).sort(), ["merck-co", "teva"]);
});

// ---- Explorer search ----

const index = { companies: manifest.companies.map((c) => ({ ...c, coverage: { status: "partial", products: 1, markets: ["US"] }, counts: {} })), ambiguous: manifest.ambiguous };

test("a canonical name and an alias resolve to the same company", () => {
  assert.equal(C.searchCompanies(index, "Roche").results[0].company.id, "roche");
  const g = C.searchCompanies(index, "Genentech").results[0];
  assert.equal(g.company.id, "roche");
  assert.equal(g.via, "also known as: Genentech");
  assert.equal(C.searchCompanies(index, "Mylan").results[0].company.id, "viatris");
  assert.equal(C.searchCompanies(index, "pfzer").results[0].company.id, "pfizer");
});

test("searching Merck offers both companies and explains they are different", () => {
  const r = C.searchCompanies(index, "Merck");
  assert.deepEqual(r.ambiguous.candidates.map((c) => c.id), ["merck-co", "merck-kgaa"]);
  assert.deepEqual(r.results.slice(0, 2).map((x) => x.company.id).sort(), ["merck-co", "merck-kgaa"]);
  assert.equal(C.searchCompanies(index, "MSD").results[0].company.id, "merck-co");
  assert.equal(C.searchCompanies(index, "m").results.length, 0);
});

test("product search lists every company with a sourced relationship", () => {
  const products = { terms: [{ k: "s", n: "fictivastatin", c: [["merck-co", "EU,US"], ["teva", "US"]] }, { k: "b", n: "Synthex", c: [["merck-co", "US"]] }] };
  assert.deepEqual(C.searchProducts(products, "fictiv").map((t) => t.n), ["fictivastatin"]);
  assert.equal(C.searchProducts(products, "fi").length, 0);
});

test("default company view leaves out corporate news; empty states say why", () => {
  const list = [
    { lane: "direct", published: "2026-10-29" },
    { lane: "corporate", published: "2026-10-29" },
    { lane: "substance", outside: "Notice from Japan", country: "JP", published: "2026-10-29" },
  ];
  assert.equal(C.filterRelated(list, {}).length, 2);
  assert.equal(C.filterRelated(list, { lanes: ["direct"] }).length, 1);
  assert.equal(C.filterRelated(list, { market: "outside" }).length, 1);
  assert.equal(C.emptyReason({ all: list, shown: [] }).kind, "filtered");
  assert.equal(C.emptyReason({ all: [], shown: [], coverage: { status: "not-mapped" } }).kind, "unmapped");
  assert.equal(C.emptyReason({ all: [], shown: [], sources: [{ ok: false, name: "EMA" }] }).kind, "outage");
});

test("followed companies are kept in this browser only and feed My Briefing", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(C.toggleFollowed("pfizer", storage), true);
  assert.deepEqual(C.loadFollowed(storage), ["pfizer"]);
  assert.equal(C.toggleFollowed("pfizer", storage), false);
  const updates = [{ id: "a", co: [{ id: "pfizer", lane: "corporate" }] }, { id: "b", co: [{ id: "pfizer", lane: "substance" }] }];
  assert.deepEqual(C.followedUpdates(updates, ["pfizer"]).map((x) => x.u.id), ["b"]);
});
