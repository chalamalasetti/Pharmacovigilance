import { test } from "node:test";
import assert from "node:assert/strict";
import { groups, findGroup, buildBriefing, briefingScore } from "../public/impact.js";
import { viewSections, pendingWork, coverageGaps, VIEWS } from "../public/views.js";

const u = (o) => ({ id: o.id ?? o.title, title: "t", source: "s", link: "https://example.org/x", tags: [o.category ?? "news"], category: "news", kind: "official", region: "Europe", country: "EU", priority: 9, published: "2026-10-30T08:00:00Z", ...o });
const now = Date.parse("2026-10-30T12:00:00Z");

test("five audiences, renamed and extended by the reader", () => {
  assert.deepEqual(groups().map((g) => g.id), ["ops", "safety", "qppv", "systems", "leader"]);
  const settings = { names: { qppv: "EU QPPV office" }, custom: [{ id: "g1", name: "Vaccines team", base: "safety", topics: ["recall"], words: ["vaccine"] }] };
  const all = groups(settings);
  assert.equal(all.find((g) => g.id === "qppv").label, "EU QPPV office");
  const custom = findGroup("g1", settings);
  assert.equal(custom.label, "Vaccines team");
  assert.equal(custom.base, "safety");
  assert.equal(custom.topics.recall, 3);
  assert.equal(findGroup("signal").id, "safety", "old role ids still work");
  const x = u({ title: "New RSV vaccine guidance", category: "guideline", tags: ["guideline"] });
  assert.ok(briefingScore(x, { role: "g1", groups: settings }).score > briefingScore(x, { role: "safety", groups: settings }).score);
});

test("each view leads with its own sections, each update once", () => {
  const updates = [
    u({ id: "gw", title: "EudraVigilance gateway planned maintenance: submissions unavailable this weekend" }),
    u({ id: "e2b", title: "EMA publishes updated E2B(R3) business rules", category: "guideline", tags: ["guideline"] }),
    u({ id: "prac", title: "PRAC meeting highlights: new safety signal for semaglutide", category: "safety", tags: ["safety"] }),
    u({ id: "meddra", title: "MedDRA version 29.1 release now available" }),
    u({ id: "insp", title: "MHRA GPvP inspection metrics published", category: "inspection", tags: ["inspection"], country: "GB" }),
  ];
  const ws = { profile: { role: "", countries: [], topics: [], watch: [] }, items: {} };
  const b = buildBriefing(updates, ws, { window: "24h", now });
  const ids = (base) => Object.fromEntries(viewSections(base, b).sections.filter((s) => !s.kind).map((s) => [s.id, s.items.map((x) => x.u.id)]));
  assert.deepEqual(ids("ops").interruptions, ["gw"]);
  assert.deepEqual(ids("safety").prac, ["prac"]);
  assert.deepEqual(ids("systems").e2b, ["e2b"]);
  assert.deepEqual(ids("systems").gateway, ["gw"]);
  assert.deepEqual(ids("systems").terms, ["meddra"]);
  assert.deepEqual(ids("qppv").inspection, ["insp"]);
  for (const base of Object.keys(VIEWS)) {
    const { sections, rest } = viewSections(base, b);
    const seen = [...sections.flatMap((s) => s.items.map((x) => x.u.id)), ...rest.map((x) => x.u.id)];
    assert.equal(seen.length, new Set(seen).size, `${base} shows each update once`);
    assert.equal(seen.length, updates.length, `${base} loses nothing`);
  }
});

test("leaders see pending work and coverage gaps", () => {
  const items = { a: { assess: { status: "open" } }, b: { assign: { to: "Ana" } }, c: { assess: { status: "notrelevant" } }, d: { assign: { to: "Raj" }, dismissed: { reason: "Duplicate" } } };
  const pw = pendingWork(items, [{ u: u({ id: "z" }) }]);
  assert.deepEqual(pw.open.map((x) => x.id), ["a", "b"]);
  assert.equal(pw.unassessedHigh.length, 1);
  const countries = [{ code: "US", country: "United States" }, { code: "JP", country: "Japan" }, { code: "IN", country: "India" }];
  const g = coverageGaps([u({ country: "US" }), u({ country: "IN", kind: "news" })], { countries, since: now - 86400000, feeds: { failed: 2, total: 60 } });
  assert.deepEqual(g.none.map((c) => c.code), ["JP"]);
  assert.deepEqual(g.newsOnly.map((c) => c.code), ["IN"]);
  assert.equal(g.failedFeeds, 2);
});
