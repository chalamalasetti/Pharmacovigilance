import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import zlib from "node:zlib";
import { readFileSync, mkdtempSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanSource, urlProblem, sourceHealth, summaryCounts, publicCoverage, fillSecrets, redact, sourceUrl } from "../public/sources-lib.js";
import { loadRegistry, buildFeeds, writeRegistryFiles } from "../scripts/sources.mjs";
import { importSql } from "../scripts/sources-sql.mjs";
import { isBlockedIp, checkUrl, guardedLookup, safeFetch, explainError } from "../scripts/safe-fetch.mjs";
import { parseItems, parseJson, parseHtml, detectFormat } from "../scripts/parse.mjs";
import { feedStatus, sourceRun, aggregate } from "../scripts/aggregate.mjs";
import { testSource, adminEmail } from "../api/source-test.js";

const seed = JSON.parse(readFileSync(new URL("../sources.json", import.meta.url), "utf8")).sources;
const H = 3600000;
const now = Date.parse("2026-10-31T12:00:00Z");
const iso = (msAgo) => new Date(now - msAgo).toISOString();

test("the schema's initial import is in step with sources.json", () => {
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.ok(schema.includes(importSql(seed)), "run npm run sources:sql");
  assert.equal(seed.length, 75);
  assert.ok(seed.every((s) => s.status === "active"));
});

test("an admin's source is tidied and its problems are named", () => {
  const ok = cleanSource({ id: "acme-alerts", name: "Acme alerts", type: "rss", classification: "vendor", regions: ["us", "EU"], url: "https://acme.example/feed.xml" });
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.source.regions, ["US", "EU"]);
  const news = cleanSource({ id: "q", name: "Query", type: "news_search", classification: "news", settings: { query: "PRAC signal" } });
  assert.match(news.source.url, /^https:\/\/news\.google\.com\/rss\/search\?q=PRAC%20signal%20when%3A30d/);
  assert.equal(news.source.settings.provider, "google_news");
  assert.deepEqual(cleanSource(news.source).source, news.source, "cleaning twice changes nothing, so the tested and saved settings match");
  assert.match(cleanSource({ id: "Bad id", name: "x" }).problems.join(" "), /lower-case/);
  assert.match(urlProblem("https://user:pw@x.org/f"), /user name or password/);
  assert.match(urlProblem("https://x.org/f?api_key=abc123"), /credential/);
  assert.equal(urlProblem("https://x.org/f?api_key={{API_KEY}}"), null);
  assert.match(urlProblem("ftp://x.org/f"), /http/);
  assert.match(urlProblem("https://x.org:8443/f"), /ports/);
  assert.match(cleanSource({ id: "a", name: "Api", type: "api", classification: "vendor", url: "https://x.org", settings: { headers: { Authorization: "Bearer abc" } } }).problems.join(), /credential/);
});

test("credentials fill placeholders and are redacted from messages", () => {
  assert.equal(fillSecrets("https://x.org/f?k={{API_KEY}}", { API_KEY: "a b" }).value, "https://x.org/f?k=a%20b");
  assert.deepEqual(fillSecrets("https://x.org/f?k={{API_KEY}}", {}).missing, ["API_KEY"]);
  assert.equal(redact("failed at https://x.org/f?k=s3cret!", { API_KEY: "s3cret!" }), "failed at https://x.org/f?k=•••");
});

test("health is kept apart from status", () => {
  const src = { status: "active", classification: "regulator" };
  assert.equal(sourceHealth(src, null, now), "never");
  assert.equal(sourceHealth(src, { last_attempt: iso(H), last_ok: false }, now), "failed");
  assert.equal(sourceHealth(src, { last_attempt: iso(H), last_ok: true, last_items: 10, newest_item: iso(24 * H) }, now), "successful");
  assert.equal(sourceHealth(src, { last_attempt: iso(8 * H), last_ok: true, last_items: 10, newest_item: iso(H) }, now), "stale", "an active source not collected for hours");
  assert.equal(sourceHealth({ ...src, status: "paused" }, { last_attempt: iso(200 * H), last_ok: true, last_items: 10, newest_item: iso(201 * H) }, now), "successful", "a paused source keeps the health it had");
  assert.equal(sourceHealth(src, { last_attempt: iso(H), last_ok: true, last_items: 0 }, now), "stale");
  assert.equal(sourceHealth(src, { last_attempt: iso(H), last_ok: true, last_items: 4, newest_item: iso(60 * 24 * H) }, now), "stale");
  const stats = new Map([["a", { last_attempt: iso(H), last_ok: false }], ["c", { last_attempt: iso(H), last_ok: false }]]);
  const c = summaryCounts([{ id: "a", status: "active" }, { id: "b", status: "active" }, { id: "c", status: "paused" }, { id: "d", status: "draft" }], stats, now);
  assert.deepEqual(c, { configured: 4, active: 2, paused: 1, draft: 1, failing: 1, stale: 0 });
});

test("public coverage lists active sources without addresses, settings or health", () => {
  const cov = publicCoverage([{ ...seed[0], settings: { query: "x" }, notes: "internal" }, { ...seed[1], status: "paused" }], iso(0));
  assert.equal(cov.total, 1);
  assert.deepEqual(Object.keys(cov.sources[0]).sort(), ["classification", "id", "name", "organization", "regions", "topics", "type"]);
});

test("the build reads the registry from the database, else the last build, else the import", async () => {
  const cfg = { url: "https://db.example", serviceKey: "sb_secret_x" };
  const rows = [{ id: "fda-medwatch", name: "FDA", organization: "", url: "https://www.fda.gov/x.xml", source_type: "rss", classification: "regulator", regions: ["US"], topics: [], status: "paused", settings: {}, notes: "" }];
  const db = async (url) => ({ ok: true, status: 200, json: async () => (url.includes("secrets") ? [{ source_id: "fda-medwatch", name: "API_KEY", value: "k" }] : rows) });
  const live = await loadRegistry({ cfg, fetchImpl: db });
  assert.equal(live.from, "database");
  assert.equal(live.sources[0].type, "rss");
  assert.deepEqual(live.secrets.get("fda-medwatch"), { API_KEY: "k" });
  assert.equal(buildFeeds(live).feeds.length, 0, "a paused source is not collected");

  const missing = async () => ({ ok: false, status: 404, text: async () => '{"code":"PGRST205","message":"Could not find the table"}' });
  await assert.rejects(loadRegistry({ cfg, fetchImpl: missing, previous: async () => null }), /collection stopped/);

  const down = async () => ({ ok: false, status: 503, text: async () => "unavailable" });
  const fallback = await loadRegistry({ cfg, fetchImpl: down, previous: async () => ({ from: "database", sources: [{ ...rows[0], type: "rss" }] }) });
  assert.equal(fallback.from, "last build");
  assert.equal(fallback.sources[0].status, "paused", "a database hiccup never resumes a paused source");

  const none = await loadRegistry({ cfg: {}, fetchImpl: down });
  assert.equal(none.from, "repository");
  assert.equal(none.sources.length, 75);
});

test("the registry snapshot carries credential names, never values", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pv-src-"));
  await writeRegistryFiles(dir, { from: "database", sources: [{ ...seed[0], url: "https://x.org/f?k={{API_KEY}}" }], secrets: new Map([[seed[0].id, { API_KEY: "s3cret" }]]) });
  const text = readFileSync(path.join(dir, "sources/registry.json"), "utf8");
  assert.ok(!text.includes("s3cret"));
  assert.deepEqual(JSON.parse(text).sources[0].credentials, ["API_KEY"]);
  assert.equal(JSON.parse(readFileSync(path.join(dir, "coverage.json"), "utf8")).total, 1);
});

test("private, metadata and reserved addresses are blocked", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00:ec2::254", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe"]) assert.ok(isBlockedIp(ip), ip);
  for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::6810:84e5"]) assert.ok(!isBlockedIp(ip), ip);
  assert.throws(() => checkUrl("http://169.254.169.254/latest/meta-data"), /private or reserved/);
  assert.throws(() => checkUrl("http://metadata.google.internal/"), /internal/);
  assert.throws(() => checkUrl("http://2130706433/"), /private or reserved/, "127.0.0.1 written as a number");
  assert.throws(() => checkUrl("https://u:p@x.org/"), /user name/);
  assert.throws(() => checkUrl("file:///etc/passwd"), /http/);
  assert.equal(checkUrl("https://www.fda.gov/rss.xml").host, "www.fda.gov");
});

test("a host name that resolves to a private address is refused at connect time", async () => {
  const lookup = guardedLookup((host, opts, cb) => cb(null, [{ address: "10.0.0.5", family: 4 }]));
  await assert.rejects(new Promise((res, rej) => lookup("evil.example", {}, (e, a) => (e ? rej(e) : res(a)))), /private or reserved network address \(10\.0\.0\.5\)/);
});

// A local feed server, reached as feeds.test (resolved to 127.0.0.1 without the guard,
// which is what the tests check around).
let hits = 0;
const server = http.createServer((req, res) => {
  const rss = '<?xml version="1.0"?><rss><channel><item><title>Drug safety communication on examplazole</title><link>https://reg.example/a</link><pubDate>Wed, 28 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Bakery opens</title><link>https://reg.example/b</link></item></channel></rss>';
  if (req.url === "/feed") return res.writeHead(200, { "content-type": "application/rss+xml" }).end(rss);
  if (req.url === "/gz") return res.writeHead(200, { "content-type": "application/rss+xml", "content-encoding": "gzip" }).end(zlib.gzipSync(rss));
  if (req.url === "/to-feed") return res.writeHead(301, { location: "/feed" }).end();
  if (req.url === "/to-metadata") return res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
  if (req.url === "/flaky") return ++hits < 2 ? res.writeHead(503).end() : res.writeHead(200).end(rss);
  if (req.url === "/big") return res.writeHead(200).end("x".repeat(3000));
  if (req.url === "/html") return res.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><html><body><a href='/news/2026/recall-notice-for-testmab'>Recall notice for Testmab lots</a><a href='/about'>About us here</a></body></html>");
  if (req.url.startsWith("/key")) return req.url === "/key?k=s3cret" ? res.writeHead(200).end(rss) : res.writeHead(401).end();
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
const port = String(server.address().port);
const local = { lookup: (h, o, cb) => cb(null, o.all ? [{ address: "127.0.0.1", family: 4 }] : "127.0.0.1", 4), ports: [port] };
const at = (p) => `http://feeds.test:${port}${p}`;

test("safe fetch follows safe redirects, unpacks gzip, retries temporary failures and caps size", async () => {
  const r = await safeFetch(at("/to-feed"), local);
  assert.equal(r.status, 200);
  assert.equal(r.redirects.length, 1);
  assert.match((await safeFetch(at("/gz"), local)).body, /examplazole/);
  await assert.rejects(safeFetch(at("/to-metadata"), local), /private or reserved/);
  const flaky = await safeFetch(at("/flaky"), { ...local, backoffMs: [10] });
  assert.equal(flaky.attempts, 2);
  await assert.rejects(safeFetch(at("/missing"), { ...local, backoffMs: [10] }), (e) => e.status === 404 && e.attempts === 1, "a 404 is not retried");
  await assert.rejects(safeFetch(at("/big"), { ...local, maxBytes: 1000 }), /larger than/);
  assert.match(explainError({ status: 403 }), /refused access/);
  assert.match(explainError({ code: "ENOTFOUND", message: "" }), /domain name/);
});

test("JSON APIs and web pages give items too; a wrong format says so", () => {
  const api = parseJson('{"data":{"results":[{"headline":"Label change","url":"https://x.org/1","date":"2026-10-01"}]}}', { source: "X", itemsPath: "data.results", fields: { title: "headline", link: "url", published: "date" } });
  assert.deepEqual([api[0].title, api[0].link, api[0].published], ["Label change", "https://x.org/1", "2026-10-01T00:00:00.000Z"]);
  const page = parseHtml("<a href='/news/1'>Safety notice about product</a><a href='/about'>About this agency</a>", { source: "Reg", linkPattern: "/news/" }, "https://reg.example/");
  assert.deepEqual(page.map((i) => i.link), ["https://reg.example/news/1"]);
  assert.equal(detectFormat("<?xml version='1.0'?><feed xmlns='x'>"), "atom");
  assert.equal(detectFormat("<?xml version='1.0'?><data/>"), "xml");
  assert.equal(detectFormat("<!DOCTYPE html><html>"), "html");
  assert.throws(() => parseItems("<!doctype html><html></html>", { type: "rss" }), /Expected an RSS or Atom feed but the address returned HTML web page/);
});

test("Test now reports status, format, samples and what would be kept", async () => {
  const src = { id: "reg-x", name: "Reg X", type: "rss", classification: "regulator", regions: ["US"], url: at("/to-feed"), settings: { relevance: "pv" } };
  const r = await testSource(src, {}, { fetchOpts: local });
  assert.equal(r.ok, true);
  assert.deepEqual([r.status, r.format, r.items, r.kept, r.redirects.length], [200, "rss", 2, 1, 1]);
  assert.deepEqual(r.samples.map((s) => s.kept), [true, false]);

  const blocked = await testSource({ ...src, url: "http://169.254.169.254/latest/meta-data" });
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /private or reserved/);

  const page = await testSource({ ...src, type: "webpage", url: at("/html"), settings: { relevance: "all", linkPattern: "/news/" } }, {}, { fetchOpts: local });
  assert.deepEqual([page.ok, page.format, page.items], [true, "html", 1]);

  const keyed = { ...src, url: `${at("/key")}?k={{API_KEY}}` };
  assert.match((await testSource(keyed, {}, { fetchOpts: local })).error, /Add the credential API_KEY/);
  const good = await testSource(keyed, { API_KEY: "s3cret" }, { fetchOpts: local });
  assert.equal(good.ok, true);
  assert.ok(!JSON.stringify(good).includes("s3cret"), "the credential never comes back");
  const bad = await testSource(keyed, { API_KEY: "wrong-key" }, { fetchOpts: local });
  assert.match(bad.error, /refused access/);
});

test("only admins may run Test now", async () => {
  const cfg = { url: "https://db.example", publicKey: "anon" };
  const fake = (admin) => async (url) => ({ ok: true, json: async () => (url.includes("is_app_admin") ? admin : { email: "v@example.org" }) });
  assert.equal(await adminEmail("token", cfg, fake(true)), "v@example.org");
  assert.equal(await adminEmail("token", cfg, fake(false)), null);
  assert.equal(await adminEmail("", cfg, fake(true)), null);
});

test("feed status keys registry sources by id and counts failures in a row", () => {
  const feeds = [{ id: "fda-medwatch", source: "FDA MedWatch", kind: "official", country: "US", url: "https://new.example/rss" }];
  const legacy = [{ id: "0123456789", ok: true, lastSuccess: iso(5 * H) }];
  const fail = { status: "rejected", reason: new Error("HTTP 503") };
  const a = feedStatus(feeds, [fail], legacy, iso(2 * H));
  assert.deepEqual([a[0].id, a[0].failures, a[0].name], ["fda-medwatch", 1, "FDA MedWatch"]);
  const b = feedStatus(feeds, [fail], a, iso(H));
  assert.equal(b[0].failures, 2);
  assert.equal(b[0].failingSince, iso(2 * H));
  const ok = feedStatus(feeds, [{ status: "fulfilled", value: [] }], b, iso(0));
  assert.equal(ok[0].failures, undefined);
  const run = sourceRun(feeds[0], fail, iso(0));
  assert.deepEqual([run.source_id, run.ok, run.error], ["fda-medwatch", false, "HTTP 503"]);
});

test("after a resume only items inside the catch-up window are collected", async () => {
  const fixtures = new URL("./fixtures/", import.meta.url).pathname;
  const dir = mkdtempSync(path.join(tmpdir(), "pv-since-"));
  cpSync(fixtures, path.join(dir, "fx"), { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(dir, "fx/manifest.json"), "utf8"));
  manifest[0].since = "2026-10-27T00:00:00Z"; // the regulator RSS fixture has items on Oct 26 and later
  manifest[0].id = "fda-medwatch";
  writeFileSync(path.join(dir, "fx/manifest.json"), JSON.stringify(manifest));
  mkdirSync(path.join(dir, "data"));
  await aggregate({ fixturesDir: path.join(dir, "fx"), out: path.join(dir, "data/updates.json") });
  const data = JSON.parse(readFileSync(path.join(dir, "data/updates.json"), "utf8"));
  const fromFda = data.updates.filter((u) => u.sourceId === "fda-medwatch");
  assert.ok(fromFda.every((u) => u.published >= "2026-10-27"), "older items are left out");
  assert.ok(!fromFda.some((u) => /Examplazole/.test(u.title)), "the Oct 26 alert is outside the window");
  assert.ok(fromFda.length > 0);
});

test("news search addresses are rebuilt from the query", () => {
  const s = seed.find((x) => x.id === "news-jp-pmda");
  assert.equal(sourceUrl(s), sourceUrl({ ...s, url: "https://ignored.example" }));
  assert.match(sourceUrl(s), /^https:\/\/news\.google\.com\/rss\/search\?q=\(PMDA%20OR/);
});
