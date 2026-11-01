import { test } from "node:test";
import assert from "node:assert/strict";
import {
  homepageData,
  excerpt,
  feedHealth,
  coverageSummary,
  feedbackLink,
  priorityPicks,
  agencyName,
} from "../public/home-lib.js";
import { homepageSnapshot } from "../scripts/homepage.mjs";
const now = Date.parse("2026-11-01T12:00:00Z"),
  updated = new Date(now).toISOString(),
  u = {
    id: "synthetic",
    title: "Synthetic FDA safety recall",
    link: "https://www.fda.gov/synthetic",
    source: "FDA source",
    kind: "official",
    country: "US",
    category: "safety",
    tags: ["safety"],
    priority: 8,
    published: updated,
  },
  raw = {
    updated,
    checked: updated,
    feeds: { total: 2, ok: 1, failed: 1 },
    countries: [{ code: "US", country: "United States" }],
    categories: [{ id: "safety", label: "Safety alerts" }],
    updates: [u],
  };
test("homepage refuses malformed payloads and unsafe links while keeping a legitimate empty feed readable", () => {
  assert.throws(() => homepageData({ updates: [] }));
  assert.throws(() =>
    homepageData({ ...raw, updates: [{ ...u, link: "javascript:alert(1)" }] }),
  );
  assert.equal(homepageData({ ...raw, updates: [] }).updates.length, 0);
  const d = homepageData({
    ...raw,
    updates: [{ ...u, published: "not-a-date", tags: null }],
  });
  assert.equal(d.updates[0].published, null);
  assert.deepEqual(d.updates[0].tags, ["safety"]);
});
test("missing source excerpts stay missing; long excerpts are shortened without inventing analysis", () => {
  assert.equal(excerpt(u), null);
  assert.equal(excerpt({ ...u, summary: u.title }), null);
  assert.equal(
    excerpt({ ...u, summary: "  Supplied source wording.  " }),
    "Supplied source wording.",
  );
  assert.ok(excerpt({ ...u, summary: "a".repeat(500) }, 200).length <= 200);
});
test("freshness distinguishes publication, last refresh, mismatched status and old snapshots", () => {
  const status = {
    ...raw,
    sources: [
      {
        id: "source",
        kind: "official",
        ok: false,
        name: "Synthetic source",
        failingSince: updated,
      },
    ],
  };
  assert.equal(feedHealth(raw, status, now).level, "warn");
  assert.equal(
    feedHealth({ ...raw, updated: "2026-10-31T00:00:00Z" }, status, now).level,
    "stale",
  );
  const h = feedHealth({ ...raw, feeds: { total: 1, ok: 1 } }, null, now);
  assert.equal(h.level, "unknown");
  assert.match(h.title, /unavailable/);
  assert.equal(
    feedHealth(
      { ...raw, feeds: { total: 1, ok: 1 } },
      { ...status, updated: "2026-10-30" },
      now,
    ).level,
    "unknown",
  );
  assert.equal(feedHealth(raw, status, now).latest, updated);
});
test("coverage distinguishes configured official organizations from secondary discovery and does not invent regulators from a country", () => {
  const s = coverageSummary({
    sources: [
      { classification: "regulator", organization: "Synthetic Agency" },
      { classification: "regulator", organization: "Synthetic Agency" },
      { classification: "news", organization: "Publisher" },
    ],
  });
  assert.deepEqual(s.direct, ["Synthetic Agency"]);
  assert.equal(s.news, 1);
  assert.equal(agencyName({ ...u, source: "Another US authority" }), null);
  assert.equal(agencyName({ ...u, agency: "HC" }), "Health Canada");
});
test("priority picks exclude generic landing pages and undated entries without deleting them from the feed", () => {
  const generic = {
      ...u,
      id: "generic",
      title: "What's New Related to Drugs",
      priority: 99,
    },
    unknown = { ...u, id: "undated", published: null };
  const input = [generic, unknown, u];
  assert.deepEqual(
    priorityPicks(input, now).map((u) => u.id),
    ["synthetic"],
  );
  assert.equal(input.length, 3);
});
test("feedback drafts contain public update evidence only and never copy company context", () => {
  const link = new URL(
    feedbackLink({
      ...u,
      companyContext: { companyName: "PRIVATE SENTINEL" },
      privateNotes: "PRIVATE SENTINEL",
    }),
  );
  assert.equal(link.origin, "https://github.com");
  assert.match(
    link.searchParams.get("body"),
    /https:\/\/www.fda.gov\/synthetic/,
  );
  assert.ok(!link.href.includes("PRIVATE"));
});
test("build snapshot contains useful escaped publication cards without JavaScript or public feed diagnostics", () => {
  const html =
      "<main><!-- home-snapshot:start -->loading<!-- home-snapshot:end --></main>",
    s = homepageSnapshot(
      html,
      {
        ...raw,
        updates: [
          {
            ...u,
            title: "Synthetic <script>alert(1)</script>",
            summary: "<img src=x onerror=alert(1)>",
          },
        ],
      },
      now,
    );
  assert.match(s, /data-page-snapshot/);
  assert.match(s, /Published <time/);
  assert.match(s, /Regulator feed/);
  assert.match(s, /&lt;script&gt;/);
  assert.ok(!s.includes("<script>"));
  assert.ok(!s.includes("<img"));
  assert.ok(!s.includes("sources reachable"));
  assert.throws(() => homepageSnapshot("<main></main>", raw, now), /markers/);
});
