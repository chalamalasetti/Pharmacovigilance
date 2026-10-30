import { test } from "node:test";
import assert from "node:assert/strict";
import { flag, matches, keyUpdates, dayLabel } from "../public/lib.js";

const u = (o) => ({ title: "t", source: "s", tags: [o.category ?? "news"], kind: "news", region: "Europe", country: "EU", priority: 5, published: "2026-10-29T00:00:00Z", ...o });
const now = Date.parse("2026-10-30T00:00:00Z");

test("flags", () => {
  assert.equal(flag("IN"), "🇮🇳");
  assert.equal(flag("EU"), "🇪🇺");
  assert.equal(flag("INT"), "🌐");
});

test("filters combine", () => {
  const x = u({ title: "PRAC recommends new measures for valproate", category: "safety", kind: "official" });
  assert.ok(matches(x, { now }));
  assert.ok(matches(x, { region: "Europe", country: "EU", cat: "safety", kind: "official", days: "7", q: "valproate prac", now }));
  assert.ok(!matches(x, { region: "Americas", now }));
  assert.ok(!matches(x, { cat: "recall", now }));
  assert.ok(!matches(x, { kind: "news", now }));
  assert.ok(!matches(x, { followed: ["IN"], now }));
  assert.ok(!matches(x, { q: "isotretinoin", now }));
  assert.ok(!matches({ ...x, published: "2026-09-01T00:00:00Z" }, { days: "30", now }));
});

test("search ignores accents and case", () => {
  assert.ok(matches(u({ title: "ANSM: rappel de lots de médicament" }), { q: "MEDICAMENT", now }));
});

test("key updates favour priority and cap each country at two", () => {
  const list = [
    u({ id: 1, country: "US", priority: 8 }),
    u({ id: 2, country: "US", priority: 8 }),
    u({ id: 3, country: "US", priority: 8 }),
    u({ id: 4, country: "IN", priority: 6 }),
    u({ id: 5, country: "JP", priority: 1 }),
  ];
  assert.deepEqual(keyUpdates(list, 6).map((x) => x.id), [1, 2, 4]);
});

test("day labels", () => {
  const ref = new Date(2026, 9, 30, 12);
  assert.equal(dayLabel(new Date(2026, 9, 30, 1), ref), "Today");
  assert.equal(dayLabel(new Date(2026, 9, 29, 23), ref), "Yesterday");
});
