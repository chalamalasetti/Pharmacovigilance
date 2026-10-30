import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDates, extractSubstances, impactCard, briefingScore, buildBriefing, parseDate, cardText } from "../public/impact.js";
import { stampRetrieved } from "../scripts/aggregate.mjs";

const u = (o) => ({ id: "x", title: "t", source: "s", link: "https://example.org/x", tags: [o.category ?? "news"], category: "news", kind: "news", region: "Europe", country: "EU", priority: 5, published: "2026-10-29T00:00:00Z", ...o });
const now = Date.parse("2026-10-30T12:00:00Z");

test("dates are told apart and quoted", () => {
  const d = extractDates("Comments should be sent by 15 January 2027. The guideline will apply from 1 March 2027, with a transition period of 12 months.");
  assert.deepEqual(d.map((x) => [x.type, x.date ?? x.value]), [["consultation", "2027-01-15"], ["effective", "2027-03-01"], ["transition", "12 months"]]);
  assert.equal(d[0].quote, "Comments should be sent by 15 January 2027");
  assert.deepEqual(extractDates("FDA final rule takes effect on March 1, 2027.").map((x) => x.date), ["2027-03-01"]);
  assert.deepEqual(extractDates("A new safety signal for examplazole."), []);
});

test("dates parse in common formats", () => {
  assert.equal(parseDate("1st March 2027"), "2027-03-01");
  assert.equal(parseDate("Sept. 30, 2027"), "2027-09-30");
  assert.equal(parseDate("June 2026"), "2026-06-01");
  assert.equal(parseDate("2027-02-15"), "2027-02-15");
});

test("substances come from INN stems and known names, not ordinary words", () => {
  assert.deepEqual(extractSubstances("Semaglutide, testmab and valproate: April peptide concept update"), ["Semaglutide", "Testmab", "Valproate"]);
  assert.deepEqual(extractSubstances("GLP-1 receptor agonists and JAK inhibitors"), ["GLP-1 receptor agonists", "JAK inhibitors"]);
});

test("impact card quotes the source and labels every implication as potential with its trigger", () => {
  const x = u({
    title: "Examplazole: Drug Safety Communication - Risk of Serious Liver Injury",
    summary: "The agency is warning that examplazole can cause serious liver injury. Labeling will be updated.",
    category: "safety", tags: ["safety", "label"], kind: "official", country: "US", agency: "FDA", retrieved: "2026-10-26T15:00:00Z",
  });
  const c = impactCard(x, { countryName: (c) => ({ US: "United States" })[c] });
  assert.match(c.changed.text, /^The agency is warning/);
  assert.equal(c.changed.from, "summary");
  assert.deepEqual(c.affected.jurisdictions, ["United States", "FDA"]);
  assert.deepEqual(c.affected.substances, ["Examplazole"]);
  assert.ok(c.affected.roles.some((r) => r.text.startsWith("Signal management")));
  assert.ok(c.business.length && c.business.every((b) => b.text.startsWith("Potential") && b.trigger));
  assert.ok(c.technical.some((t) => t.key === "listedness"));
  assert.deepEqual(c.dates.map((d) => d.type), ["published"]);
  assert.equal(c.evidence.official, true);
  assert.equal(c.evidence.retrieved, "2026-10-26T15:00:00Z");
  assert.match(cardText(x, c), /Business impact \(potential\):/);
});

test("headline-only news gets no invented summary and flags technical rules only on evidence", () => {
  const c = impactCard(u({ title: "EMA publishes E2B(R3) business rules update for EudraVigilance under GVP Module VI", category: "guideline", tags: ["guideline"] }));
  assert.equal(c.changed.from, "headline");
  assert.deepEqual(c.evidence.sections, ["GVP Module VI"]);
  assert.deepEqual(c.technical.map((t) => t.key).sort(), ["icsr", "interface"]);
  assert.equal(impactCard(u({ title: "Company reports quarterly results" })).technical.length, 0);
});

test("briefing score: watchlist always counts, otherwise countries and topics must match", () => {
  const x = u({ title: "PRAC reviews valproate signal", category: "safety", tags: ["safety"], country: "EU", kind: "official", priority: 9 });
  assert.ok(briefingScore(x, { countries: ["EU"] }).score > 0);
  assert.equal(briefingScore(x, { countries: ["JP"] }).score, 0);
  assert.equal(briefingScore(x, { topics: ["recall"] }).score, 0);
  assert.deepEqual(briefingScore(x, { countries: ["JP"], watch: ["Valproate"] }).hits, ["Valproate"]);
  assert.ok(briefingScore(x, { role: "signal" }).score > briefingScore(x, { role: "qa" }).score);
  assert.ok(briefingScore(u({ country: "INT" }), { countries: ["JP"] }).score > 0);
});

test("briefing drops dismissed updates, keeps the window and finds follow-ups and upcoming dates", () => {
  const updates = [
    u({ id: "a", title: "Valproate: new pregnancy prevention measures", category: "safety", tags: ["safety"], published: "2026-10-30T08:00:00Z" }),
    u({ id: "b", title: "Old safety notice", category: "safety", tags: ["safety"], published: "2026-10-20T08:00:00Z" }),
    u({ id: "c", title: "Dismissed notice", published: "2026-10-30T09:00:00Z" }),
    u({ id: "d", title: "Semaglutide label update", category: "label", tags: ["label"], published: "2026-10-30T10:00:00Z" }),
    u({ id: "e", title: "Draft guideline", summary: "The consultation closes on 31 January 2027.", category: "guideline", tags: ["guideline"], published: "2026-10-30T11:00:00Z" }),
  ];
  const ws = { profile: { role: "", countries: [], topics: [], watch: ["valproate"] }, items: { c: { dismissed: { reason: "Duplicate of another update" } }, z: { followed: true, follow: ["Semaglutide"] } } };
  const b = buildBriefing(updates, ws, { window: "24h", now });
  assert.deepEqual(b.watch.map((x) => x.u.id), ["a"]);
  assert.ok(!b.all.some((x) => x.u.id === "b" || x.u.id === "c"));
  assert.deepEqual(b.followUps.map((x) => x.u.id), ["d"]);
  assert.deepEqual(b.upcoming.map((d) => [d.type, d.date]), [["consultation", "2027-01-31"]]);
  assert.equal(buildBriefing(updates, ws, { window: "7d", now: Date.parse("2026-10-27T00:00:00Z") + 7 * 86400000 }).all.some((x) => x.u.id === "b"), false);
});

test("an update keeps the date PV Info first retrieved it", () => {
  const fresh = [{ id: "a" }, { id: "b" }];
  stampRetrieved(fresh, [{ id: "a", retrieved: "2026-10-01T00:00:00Z" }], "2026-10-30T00:00:00Z");
  assert.deepEqual(fresh.map((x) => x.retrieved), ["2026-10-01T00:00:00Z", "2026-10-30T00:00:00Z"]);
});
