import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { run, seoBlock, syncHead, sitemap, robots, pageMeta } from "../scripts/seo.mjs";

const page = (extra = "") => `<!doctype html>\n<html><head>\n  <title>Demo · PV Info</title>\n  <meta name="description" content="A &quot;demo&quot; page.">\n${extra}  <link rel="stylesheet" href="styles.css">\n</head><body></body></html>\n`;

test("every committed page has a title, a description and an up-to-date seo block", async () => {
  const { pages, issues } = await run({ write: false, env: {} });
  assert.deepEqual(issues, []);
  for (const [file, html] of pages) {
    const committed = await readFile(new URL(`../public/${file}`, import.meta.url), "utf8");
    assert.equal(committed, html, `${file} is out of date: run npm run seo`);
  }
});

test("seo block carries canonical and social tags from the page's own title and description", () => {
  const html = syncHead("about.html", page(), { base: "https://www.pvinfo.org" });
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.pvinfo\.org\/about\.html">/);
  assert.match(html, /og:title" content="Demo · PV Info"/);
  assert.match(html, /og:description" content="A &quot;demo&quot; page\."/);
  assert.ok(html.indexOf("seo:end") < html.indexOf("styles.css"));
  assert.equal(syncHead("about.html", html, { base: "https://www.pvinfo.org" }), html, "idempotent");
});

test("home page canonical is the root and verification tag only when given", () => {
  assert.match(seoBlock("index.html", page(), { base: "https://x.org" }), /canonical" href="https:\/\/x\.org\/"/);
  assert.doesNotMatch(seoBlock("index.html", page()), /google-site-verification/);
  assert.match(seoBlock("index.html", page(), { verification: "abc" }), /google-site-verification" content="abc"/);
  assert.doesNotMatch(seoBlock("about.html", page(), { verification: "abc" }), /google-site-verification/);
});

test("noindex pages get no canonical and stay out of the sitemap", () => {
  const hidden = page('  <meta name="robots" content="noindex">\n');
  assert.equal(pageMeta(hidden).noindex, true);
  assert.doesNotMatch(seoBlock("admin.html", hidden), /canonical/);
  const map = sitemap([["index.html", page()], ["admin.html", hidden], ["research.html", page()], ["paper.html", page()], ["company.html", page()]], {
    base: "https://www.pvinfo.org", papers: [{ id: "PMC1&2", published: "2025-03-04" }], companies: [{ id: "acme" }], now: new Date("2026-10-31T00:00:00Z"),
  });
  assert.match(map, /<loc>https:\/\/www\.pvinfo\.org\/<\/loc><lastmod>2026-10-31<\/lastmod>/);
  assert.match(map, /research\.html/);
  assert.doesNotMatch(map, /admin\.html/);
  assert.match(map, /paper\.html\?id=PMC1%262<\/loc><lastmod>2025-03-04/);
  assert.match(map, /company\.html\?id=acme/);
  assert.match(robots({ base: "https://www.pvinfo.org" }), /Sitemap: https:\/\/www\.pvinfo\.org\/sitemap\.xml/);
});

test("build writes sitemap.xml and robots.txt and adds the verification tag", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "seo-"));
  await writeFile(path.join(dir, "index.html"), page());
  await writeFile(path.join(dir, "new-page.html"), page());
  await run({ build: true, dir, env: { GOOGLE_SITE_VERIFICATION: "tok123", SEO_SITE_URL: "https://www.pvinfo.org/" } });
  const map = await readFile(path.join(dir, "sitemap.xml"), "utf8");
  assert.match(map, /https:\/\/www\.pvinfo\.org\/new-page\.html/);
  assert.match(await readFile(path.join(dir, "robots.txt"), "utf8"), /Sitemap:/);
  assert.match(await readFile(path.join(dir, "index.html"), "utf8"), /google-site-verification" content="tok123"/);
});
