import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as R from "../public/resources-lib.js";
import { importSql } from "../scripts/resources-sql.mjs";
import { loadResources, writeResources } from "../scripts/resources.mjs";
import { buildFeeds } from "../scripts/sources.mjs";
import { reconcile } from "../public/workspace.js";

const seed = JSON.parse(readFileSync(new URL("../resources.json", import.meta.url), "utf8")).resources;
const sources = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8")).sources;
const agencies = JSON.parse(readFileSync(new URL("../public/data/agencies.json", import.meta.url), "utf8"));
const pub = R.publicResources(seed, { activeSources: new Set(sources.map((s) => s.id)), now: "2026-10-31T00:00:00Z" });

test("the schema's resource import is in step with resources.json", () => {
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.ok(schema.includes(importSql(seed)), "run npm run resources:sql");
});

test("every seed resource is complete, cites an official link and is honest about verification", () => {
  assert.equal(new Set(seed.map((r) => r.id)).size, seed.length, "ids are unique");
  for (const r of seed) {
    assert.deepEqual(R.cleanResource(r).problems, [], r.id);
    assert.match(r.url, /^https:\/\//, r.id);
    if (r.status === "published") assert.ok(r.verified?.on && r.verified.method === "automated", `${r.id} is published only with its check recorded`);
    else assert.equal(r.verified, null, `${r.id}: a draft has no verification date`);
    if (r.sourceId) assert.ok(sources.some((s) => s.id === r.sourceId), `${r.id} links to an existing source`);
  }
  for (const c of R.CATEGORIES) assert.ok(pub.byCategory[c.id] > 0, `${c.id} has resources`);
  for (const s of R.SPECIALTIES) assert.ok(pub.resources.some((r) => r.specialties.includes(s.id)), `${s.id} has resources`);
});

test("the public file holds published resources only, without editors' details", () => {
  assert.equal(pub.total, seed.filter((r) => r.status === "published").length);
  assert.deepEqual(pub.skipped, []);
  const one = pub.resources[0];
  for (const k of ["status", "sourceId", "verifiedBy", "linkNote", "updatedAt"]) assert.ok(!(k in one), k);
  assert.match(pub.coverage, /does not list every safety database/);
  const rows = [{ ...seed.find((r) => r.id === "fda-recalls"), verifiedBy: "editor@x.org" }, { ...seed.find((r) => r.id === "pmda-jader") }, { ...seed.find((r) => r.id === "lactmed") }];
  const out = R.publicResources(rows, { activeSources: new Set(["fda-recalls"]) });
  assert.deepEqual(out.resources.map((r) => [r.id, r.collected]), [["pmda-jader", false], ["fda-recalls", true]]);
  assert.ok(!JSON.stringify(out).includes("editor@x.org"));
  const paused = R.publicResources(rows, { activeSources: new Set() });
  assert.ok(paused.resources.every((r) => !r.collected), "collected only while the registry source is active");
  const unverified = R.publicResources([{ ...rows[1], verified: null }]);
  assert.equal(unverified.total, 0);
  assert.match(unverified.skipped[0].problem, /verified/);
});

test("a plain question is read into filters", () => {
  assert.deepEqual(R.parseQuery("Find adverse-event data for Japan", agencies), { country: "JP", category: "adverse_events", specialty: "", product: "", data: "", words: [] });
  assert.equal(R.parseQuery("Where can I find an official warning in the UK?", agencies).category, "safety_comms");
  assert.equal(R.parseQuery("Where can I find an official warning in the UK?", agencies).country, "GB");
  assert.deepEqual(R.parseQuery("tell us about vaccine side effects", agencies).country, "", "lower-case 'us' is not the United States");
  assert.equal(R.parseQuery("US recalls", agencies).country, "US");
  assert.equal(R.parseQuery("PMDA package inserts", agencies).country, "JP");
  assert.equal(R.parseQuery("data for analysis", agencies).data, "data");
  assert.equal(R.parseQuery("pregnancy", agencies).specialty, "pregnancy");
  assert.deepEqual(R.parseQuery("FAERS", agencies).words, ["faers"]);
});

test("searching for Japan's adverse-event data finds Japan's own database before international ones", () => {
  const f = { ...R.parseQuery("Find adverse-event data for Japan", agencies) };
  const ids = R.rank(pub.resources.filter((r) => R.matches(r, f)), f).map((r) => r.id);
  assert.equal(ids[0], "pmda-jader");
  assert.ok(ids.includes("vigiaccess"));
  assert.ok(!ids.includes("fda-faers"));
  const de = { country: "DE", category: "adverse_events" };
  assert.ok(pub.resources.filter((r) => R.matches(r, de)).some((r) => r.id === "eudravigilance-adrreports"), "EU-wide resources cover member states");
});

test("each guide question suggests the right kind of resource", () => {
  for (const g of R.GUIDE) {
    const hits = pub.resources.filter((r) => R.matches(r, g.filters));
    assert.ok(hits.length >= 3, g.id);
  }
  const data = pub.resources.filter((r) => R.matches(r, R.GUIDE.find((g) => g.id === "data").filters));
  assert.ok(data.every((r) => R.hasDownload(r) || R.hasApi(r)));
  const fav = { favorites: true, favs: new Set(["openfda"]) };
  assert.deepEqual(pub.resources.filter((r) => R.matches(r, fav)).map((r) => r.id), ["openfda"]);
});

test("favorites toggle and survive a sync from another device", () => {
  const ws = { version: 1, profile: {}, items: {} };
  assert.equal(R.toggleFavorite(ws, "vaers", "2026-10-31T00:00:00Z"), true);
  assert.equal(R.toggleFavorite(ws, "vaers"), false);
  R.toggleFavorite(ws, "pmda-jader", "2026-10-31T00:00:00Z");
  const local = { ...ws, changedAt: "2026-10-31T10:00:00Z", syncedAt: "2026-10-30T00:00:00Z" };
  const remote = { version: 1, profile: {}, items: {}, changedAt: "2026-10-31T09:00:00Z" };
  assert.deepEqual(reconcile(local, remote).ws.resourceFavs, { "pmda-jader": "2026-10-31T00:00:00Z" });
  assert.ok(!("resourceFavs" in reconcile({ ...local, resourceFavs: undefined }, remote).ws));
});

test("listing a resource never adds a feed", async () => {
  const registry = { sources: sources.map((s) => (s.id === "fda-recalls" ? { ...s, status: "paused" } : s)), from: "repository" };
  const before = buildFeeds(registry).feeds.map((f) => f.id);
  const dir = mkdtempSync(path.join(tmpdir(), "res-"));
  const loaded = await loadResources({ cfg: {}, seed: async () => seed });
  assert.equal(loaded.from, "repository");
  const out = await writeResources(dir, loaded, registry);
  assert.deepEqual(buildFeeds(registry).feeds.map((f) => f.id), before);
  assert.ok(!before.includes("fda-recalls"));
  assert.equal(out.resources.find((r) => r.id === "fda-recalls").collected, false, "a paused source is not shown as collected");
  const file = JSON.parse(readFileSync(path.join(dir, "resources.json"), "utf8"));
  assert.equal(file.total, out.total);
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  const section = schema.slice(schema.indexOf("-- ── Safety data resources"));
  assert.ok(!/(insert into|update|delete from) public\.data_sources/i.test(section), "the resource functions never change the source registry");
});

test("the build falls back to the last published directory when the database is down", async () => {
  const cfg = { url: "https://db.example", serviceKey: "k" };
  const down = async () => { throw new Error("offline"); };
  const prev = { from: "database", resources: pub.resources.slice(0, 3).map((r, i) => ({ ...r, collected: i === 0 })) };
  const loaded = await loadResources({ cfg, fetchImpl: down, previous: async () => prev });
  assert.equal(loaded.from, "last build");
  const out = await writeResources(mkdtempSync(path.join(tmpdir(), "res-")), loaded, null);
  assert.equal(out.total, 3);
  assert.deepEqual(out.resources.map((r) => r.collected).filter(Boolean).length, 1);
  const missing = async () => new Response('{"code":"PGRST205"}', { status: 404 });
  assert.equal((await loadResources({ cfg, fetchImpl: missing, seed: async () => seed })).from, "repository");
});

test("a resource needs every field the directory card shows", () => {
  const { problems } = R.cleanResource({ id: "x", name: "X DB", url: "ftp://x" });
  for (const re of [/organization/, /category/, /Countries/, /product/, /question/, /limitations/, /access it/, /https/]) assert.ok(problems.some((p) => re.test(p)), re.source);
  assert.ok(R.reviewDue({ verified: { on: "2025-01-01" } }, Date.parse("2026-10-31")));
  assert.ok(!R.reviewDue({ verified: { on: "2026-10-01" } }, Date.parse("2026-10-31")));
});
