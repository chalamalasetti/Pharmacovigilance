import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dataHealth } from "../public/lib.js";
import { feedStatus, buildStatus, aggregate } from "../scripts/aggregate.mjs";
import { healthReport } from "../scripts/health.mjs";

const H = 3600000;
const now = Date.parse("2026-10-30T12:00:00Z");
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const feeds = [
  { source: "FDA MedWatch", kind: "official", country: "US", url: "https://fda.example/rss" },
  { source: "PMDA in the news", kind: "news", country: "JP", url: "https://news.example/pmda" },
];

test("feed status remembers the last success and how long a feed has been down", () => {
  const first = feedStatus(feeds, [{ status: "fulfilled", value: [1, 2] }, { status: "fulfilled", value: [] }], [], iso(2 * H));
  assert.deepEqual(first.map((s) => [s.name, s.ok, s.count]), [["FDA MedWatch", true, 2], ["PMDA in the news (JP)", true, 0]]);

  const down = feedStatus(feeds, [{ status: "rejected", reason: new Error("HTTP 503") }, { status: "fulfilled", value: [] }], first, iso(H));
  assert.deepEqual([down[0].ok, down[0].error, down[0].lastSuccess, down[0].failingSince], [false, "HTTP 503", iso(2 * H), iso(H)]);

  const still = feedStatus(feeds, [{ status: "rejected", reason: new Error("timeout") }, { status: "fulfilled", value: [] }], down, iso(0));
  assert.equal(still[0].failingSince, iso(H), "outage start is kept");
  assert.equal(still[0].lastSuccess, iso(2 * H));
});

const healthy = () =>
  buildStatus({
    checked: iso(10 * 60000),
    updated: iso(10 * 60000),
    sources: [
      { id: "a", name: "FDA MedWatch", kind: "official", ok: true, count: 3, lastSuccess: iso(10 * 60000) },
      { id: "b", name: "PMDA in the news", kind: "news", ok: true, count: 1, lastSuccess: iso(10 * 60000) },
    ],
    research: { refreshed: iso(H), sources: [{ id: "europepmc", name: "Europe PMC", configured: true, ok: true, lastSuccess: iso(H) }] },
  });

test("healthy data is ok and raises no alert", () => {
  assert.deepEqual(dataHealth(healthy(), now), { level: "ok", problems: [] });
  assert.equal(healthReport(healthy(), now).healthy, true);
});

test("a regulator feed shows as down at once but alerts only after 6 hours", () => {
  const s = healthy();
  Object.assign(s.sources[0], { ok: false, error: "HTTP 503", failingSince: iso(H) });
  let h = dataHealth(s, now);
  assert.equal(h.level, "warn");
  assert.equal(h.problems[0].alert, false);
  assert.equal(healthReport(s, now).healthy, true);

  s.sources[0].failingSince = iso(7 * H);
  h = dataHealth(s, now);
  assert.equal(h.problems[0].alert, true);
  assert.match(h.problems[0].text, /FDA MedWatch could not be reached for 7 h \(HTTP 503\)/);
  const r = healthReport(s, now);
  assert.equal(r.healthy, false);
  assert.match(r.body, /Needs attention/);
});

test("a site that stopped rebuilding, or got no data, is stale and alerts", () => {
  const s = healthy();
  s.checked = s.updated = iso(5 * H);
  assert.equal(dataHealth(s, now).level, "stale");
  assert.equal(healthReport(s, now).healthy, false);

  const t = healthy();
  t.updated = iso(4 * H);
  assert.match(dataHealth(t, now).problems[0].text, /No source has been reachable for 4 h/);
  assert.equal(healthReport(null, now).healthy, false, "a missing status file alerts too");
});

test("half the news searches failing alerts; one does not", () => {
  const s = healthy();
  s.sources[1].ok = false;
  const h = dataHealth(s, now);
  assert.equal(h.problems.length, 1);
  assert.equal(h.problems[0].alert, true, "1 of 1 is over half");
  s.sources.push(...Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, name: `n${i}`, kind: "news", ok: true })));
  assert.equal(dataHealth(s, now).problems[0].alert, false);
});

test("aggregate writes status.json next to updates.json", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pv-"));
  mkdirSync(path.join(dir, "data"));
  await aggregate({ fixturesDir: new URL("./fixtures/", import.meta.url).pathname, out: path.join(dir, "data", "updates.json") });
  const status = JSON.parse(readFileSync(path.join(dir, "data", "status.json"), "utf8"));
  assert.equal(status.feeds.total, 3);
  assert.equal(status.feeds.ok, 3);
  assert.ok(status.sources.every((s) => s.ok && s.lastSuccess === status.checked));
  assert.equal(status.updated, status.checked);
});

test("a source failing many runs in a row alerts on its own, and is never switched off", () => {
  const s = healthy();
  Object.assign(s.sources[1], { ok: false, error: "HTTP 500", failures: 5 });
  assert.ok(!dataHealth(s, now).problems.some((p) => p.alert && p.source === "b"));
  s.sources[1].failures = 6;
  const p = dataHealth(s, now).problems.find((p) => p.source === "b");
  assert.equal(p.alert, true);
  assert.match(p.text, /failed 6 collections in a row/);
});
