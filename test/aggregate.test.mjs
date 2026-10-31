import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseFeed, normalizeLink, pickUpdates, aggregate } from "../scripts/aggregate.mjs";
import { buildFeeds, newsSearchUrl } from "../scripts/sources.mjs";
import { feedFromSource } from "../public/sources-lib.js";

const fixtures = new URL("./fixtures/", import.meta.url);
const read = (f) => readFileSync(new URL(f, fixtures), "utf8");

test("RSS and Atom items parse with clean titles, links and dates", () => {
  const rss = parseFeed(read("regulator-rss.xml"), { source: "Reg" });
  assert.equal(rss.length, 2);
  assert.equal(rss[0].link, "https://regulator.example.org/safety/examplazole");
  assert.match(rss[0].summary, /^The agency is warning/);
  assert.equal(rss[0].published, "2026-10-26T14:00:00.000Z");

  const atom = parseFeed(read("regulator-atom.xml"), { source: "Reg" });
  assert.equal(atom[0].link, "https://regulator.example.org/dsu/sample-guideline");
  assert.equal(atom[0].published, "2026-10-28T10:00:00.000Z");
});

test("news search items lose the outlet suffix and the echoed description", () => {
  const [first] = parseFeed(read("news-search.xml"), { source: "PV news search" });
  assert.equal(first.title, "CDSCO issues new pharmacovigilance guidance for marketing authorisation holders");
  assert.equal(first.source, "Example Pharma Times");
  assert.equal(first.summary, "");
});

test("tracking parameters are stripped", () => {
  assert.equal(normalizeLink("http://x.org/a/?utm_source=rss&id=3#top"), "https://x.org/a?id=3");
});

test("duplicates collapse, official copy wins, old items drop", () => {
  const now = Date.parse("2026-10-30T00:00:00Z");
  const picked = pickUpdates(
    [
      { title: "Same headline", link: "https://a", kind: "news", published: "2026-10-29T00:00:00Z" },
      { title: "Same headline!", link: "https://b", kind: "official", published: "2026-10-29T00:00:00Z" },
      { title: "Ancient", link: "https://c", kind: "official", published: "2026-01-01T00:00:00Z" },
    ],
    { now },
  );
  assert.deepEqual(picked.map((u) => u.link), ["https://b"]);
});

test("the imported registry gives the 75 feeds the build collected before it", () => {
  const { sources } = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url)));
  const { feeds, problems } = buildFeeds({ sources });
  assert.deepEqual(problems, []);
  assert.equal(feeds.length, 75);
  assert.equal(feeds.filter((f) => f.kind === "official").length, 12);
  assert.equal(feeds.filter((f) => f.kind === "news").length, 63);
  assert.equal(new Set(feeds.map((f) => f.id)).size, 75, "ids are unique");
  assert.ok(feeds.every((f) => /^https:\/\//.test(f.url)));
  const cdsco = feeds.find((f) => f.id === "news-in-cdsco");
  assert.deepEqual([cdsco.kind, cdsco.country, cdsco.relevance], ["news", "IN", "pv"]);
  assert.equal(feeds.find((f) => f.id === "fda-medwatch").url, "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml");
  assert.equal(feeds.find((f) => f.id === "search-pharmacovigilance").country, null);
  assert.match(newsSearchUrl("CDSCO"), /q=CDSCO%20when%3A30d&hl=en-US&gl=US&ceid=US:en$/);
  // Paused and draft sources are not collected.
  const paused = buildFeeds({ sources: sources.map((s, i) => (i < 2 ? { ...s, status: i ? "draft" : "paused" } : s)) });
  assert.equal(paused.feeds.length, 73);
  assert.equal(feedFromSource(sources[0]).id, sources[0].id);
});

test("aggregate over fixtures tags countries and topics and writes the files", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pv-"));
  mkdirSync(path.join(dir, "data"));
  const out = path.join(dir, "data", "updates.json");
  const n = await aggregate({ fixturesDir: new URL(fixtures).pathname, out });
  const data = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(n, data.updates.length);
  const byTitle = Object.fromEntries(data.updates.map((u) => [u.title, u]));

  // Bakery story is dropped; the news copy of the FDA-style alert collapses into the official one.
  assert.equal(data.updates.length, 5);
  assert.ok(!byTitle["Local bakery wins regional award"]);

  const alert = byTitle["Examplazole: Drug Safety Communication - Risk of Serious Liver Injury"];
  assert.deepEqual([alert.kind, alert.country, alert.region, alert.agency, alert.category], ["official", "US", "Americas", "FDA", "safety"]);
  assert.ok(alert.tags.includes("label"));

  assert.equal(byTitle["Testmab Injection Lots Recalled Due to Particulate Matter"].category, "recall");
  assert.equal(byTitle["Guidance on Yellow Card reporting for biosimilars"].country, "GB");
  assert.equal(byTitle["Guidance on Yellow Card reporting for biosimilars"].category, "guideline");

  const india = byTitle["CDSCO issues new pharmacovigilance guidance for marketing authorisation holders"];
  assert.deepEqual([india.kind, india.country, india.agency, india.category], ["news", "IN", "CDSCO", "guideline"]);
  assert.ok(india.tags.includes("safety"));
  const japan = byTitle["PMDA and MHLW order revision of precautions for two anticoagulants"];
  assert.deepEqual([japan.country, japan.agency, japan.category], ["JP", "PMDA", "label"]);

  assert.equal(data.countries.find((c) => c.code === "IN").count, 1);
  assert.equal(data.categories.find((c) => c.id === "recall").count, 1);
  const rss = readFileSync(path.join(dir, "feed.xml"), "utf8");
  assert.match(rss, /<title>\[India\] CDSCO issues new pharmacovigilance guidance/);
});
