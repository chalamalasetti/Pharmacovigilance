import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, parse, reply, pageLink } from "../public/chat-lib.js";

const agencies = JSON.parse(readFileSync(new URL("../public/data/agencies.json", import.meta.url)));
const now = Date.parse("2026-10-30T12:00:00Z");
const u = (o) => ({ title: "t", source: "Src", kind: "news", region: "Europe", country: "EU", category: "news", priority: 1, published: "2026-10-29T00:00:00Z", ...o, tags: o.tags ?? [o.category ?? "news"] });
const updates = [
  u({ id: 1, title: "FDA adds boxed warning to examplazole", country: "US", region: "Americas", category: "safety", kind: "official", published: "2026-10-29T10:00:00Z" }),
  u({ id: 2, title: "PRAC starts review of semaglutide", country: "EU", category: "safety", kind: "official", published: "2026-10-28T10:00:00Z" }),
  u({ id: 3, title: "CDSCO notifies new PV guidance for MAHs", country: "IN", region: "Asia-Pacific", category: "guideline", published: "2026-10-20T10:00:00Z" }),
  u({ id: 4, title: "Nitrosamine recall of valsartan lots", country: "IN", region: "Asia-Pacific", category: "recall", published: "2026-09-15T10:00:00Z" }),
];
const data = {
  updated: "2026-10-30T11:00:00Z",
  categories: [
    { id: "safety", label: "Safety alerts & signals" },
    { id: "recall", label: "Recalls & quality" },
    { id: "guideline", label: "Guidelines & guidance" },
    { id: "news", label: "Industry & science news" },
  ],
  countries: agencies.map((c) => ({ code: c.code, country: c.country, region: c.region })),
  updates,
};
const idx = buildIndex(data, agencies);

test("questions become filters", () => {
  assert.deepEqual(
    (({ country, cat, days, terms }) => ({ country, cat, days, terms }))(parse("FDA safety alerts this week", idx)),
    { country: "US", cat: "safety", days: 7, terms: [] },
  );
  assert.equal(parse("What's new in India?", idx).country, "IN");
  assert.equal(parse("guidelines in asia", idx).region, "Asia-Pacific");
  assert.equal(parse("EMA PRAC updates", idx).country, "EU");
  assert.deepEqual(parse("semaglutide", idx).terms, ["semaglutide"]);
  assert.ok(parse("official recalls", idx).official);
});

test("common words don't count as agencies unless typed as names", () => {
  assert.equal(parse("who issued this?", idx).country, null);
  assert.equal(parse("WHO vaccine safety", idx).country, "INT");
  assert.equal(parse("tell us about recalls", idx).country, null);
});

test("answers list matching updates with sources and a link to the full list", () => {
  const r = reply("India", idx, { now, max: 1 });
  assert.match(r.text, /^2 updates: updates for 🇮🇳 India\. Here are the 1 newest\./);
  assert.equal(r.cards[0].title, "CDSCO notifies new PV guidance for MAHs");
  assert.match(r.cards[0].meta, /India · Guidelines & guidance/);
  assert.equal(r.more.href, "./?country=IN&days=60");
});

test("free text finds a drug, and an empty short window widens", () => {
  assert.equal(reply("semaglutide", idx, { now }).cards[0].title, "PRAC starts review of semaglutide");
  const r = reply("recalls today", idx, { now });
  assert.match(r.text, /^Nothing today, but here are the most recent\./);
  assert.equal(r.cards.length, 1);
});

test("no match says so, help and summary answer without cards", () => {
  assert.match(reply("isotretinoin Brazil", idx, { now }).text, /couldn't find/);
  assert.match(reply("hi", idx, { now }).text, /Ask me about a country/);
  assert.match(reply("summary", idx, { now }).text, /This week: 2 updates from 2 countries/);
});

test("page links carry the filters", () => {
  assert.equal(pageLink({ country: "US", cat: "safety", days: 7, terms: [], official: true }), "./?country=US&cat=safety&kind=official&days=7");
});
