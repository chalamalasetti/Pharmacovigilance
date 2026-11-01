const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PV_BROWSER_EXECUTABLE || chromium.executablePath(),
    args: ["--no-sandbox"],
  });
  const errors = [],
    now = new Date().toISOString();
  const { homepageSnapshot } = await import("../../scripts/homepage.mjs");
  const update = (id, country, agency, kind, title, extra = {}) => ({
    id,
    country,
    agency,
    kind,
    title,
    link: "https://www.fda.gov/synthetic-" + id,
    source:
      kind === "official"
        ? agency + " synthetic source"
        : "Synthetic publisher",
    region: country === "US" ? "Americas" : "Europe",
    category: "safety",
    tags: ["safety"],
    priority: 7,
    published: now,
    ...extra,
  });
  const fixture = {
    updated: now,
    checked: now,
    feeds: { total: 2, ok: 1, failed: 1 },
    countries: [
      { code: "US", country: "United States", region: "Americas", count: 1 },
      { code: "EU", country: "European Union", region: "Europe", count: 1 },
      { code: "GB", country: "United Kingdom", region: "Europe", count: 1 },
    ],
    categories: [
      { id: "safety", label: "Safety alerts", count: 2 },
      { id: "guideline", label: "Guidance", count: 1 },
    ],
    updates: [
      update("fda", "US", "FDA", "official", "Synthetic FDA safety recall", {
        summary: "The source supplies a synthetic recall excerpt.",
      }),
      update("ema", "EU", "EMA", "news", "Synthetic EMA guidance", {
        category: "guideline",
        tags: ["guideline"],
      }),
      update("mhra", "GB", "MHRA", "official", "Synthetic MHRA safety notice", {
        published: null,
      }),
    ],
  };
  const status = {
    ...fixture,
    sources: [
      {
        id: "bad",
        name: "Synthetic unavailable source",
        country: "US",
        kind: "official",
        ok: false,
        failingSince: now,
      },
      {
        id: "good",
        name: "Synthetic reachable source",
        country: "GB",
        kind: "official",
        ok: true,
        count: 1,
        lastSuccess: now,
      },
    ],
  };
  const cloud = `export const team={id:null,list:[],items:new Map()};export async function isAdmin(){return window.fixtureRole==='admin';}export async function initCloud(){return null;}export async function navOnly(){}export function teamSummary(){return {};}export async function teamAction(){}export async function client(){return null;}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  let statusReads = 0,
    mode = "ok";
  await context.route("**/cloud.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: cloud }),
  );
  await context.route("**/data/site.json", (r) =>
    r.fulfill({ json: { statusStrip: "everyone" } }),
  );
  await context.route("**/data/status.json", (r) => {
    statusReads++;
    return r.fulfill({ json: status });
  });
  await context.route("**/data/coverage.json", (r) =>
    r.fulfill({
      json: {
        sources: [
          { classification: "regulator", organization: "Synthetic FDA" },
          { classification: "news", organization: "Synthetic news" },
        ],
      },
    }),
  );
  await context.route("**/data/companies/index.json", (r) =>
    r.fulfill({ json: { companies: [] } }),
  );
  await context.route("**/data/updates.json", (r) =>
    mode === "fail"
      ? r.fulfill({ status: 503, json: {} })
      : mode === "bad"
        ? r.fulfill({ json: { bad: true } })
        : r.fulfill({
            json: mode === "empty" ? { ...fixture, updates: [] } : fixture,
          }),
  );
  const html = homepageSnapshot(
    fs.readFileSync("public/index.html", "utf8"),
    fixture,
  );
  await context.route("http://127.0.0.1:4173/", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await context.addInitScript(() => {
    window.fixtureRole = localStorage.getItem("pv-test-role") || "public";
    localStorage.setItem(
      "pv-site",
      JSON.stringify({ statusStrip: "everyone" }),
    );
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("heading", { name: "3 updates", exact: true }).waitFor();
  assert.equal(await page.locator("#home-health").isVisible(), false);
  assert.equal(statusReads, 0);
  assert.equal(await page.locator('a[href="status.html"]:visible').count(), 0);
  assert.equal(await page.locator("#list .card").count(), 3);
  await page.getByLabel("Country or body", { exact: true }).selectOption("US");
  assert.equal(await page.locator("#list .card").count(), 1);
  await page
    .getByRole("button", { name: "Remove filter: United States", exact: true })
    .click();
  await page.getByLabel("Topic", { exact: true }).selectOption("guideline");
  await page.locator("#list .badge-news").first().waitFor();
  assert.equal(await page.locator("#list .card").count(), 1);
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page
    .getByLabel("Search updates", { exact: true })
    .fill("not-found-anywhere");
  await page
    .getByRole("heading", {
      name: "No updates match these filters",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Reset all filters", exact: true })
    .click();
  await page.getByRole("heading", { name: "3 updates", exact: true }).waitFor();
  await page
    .getByLabel("Search updates", { exact: true })
    .fill("United Kingdom");
  await page.getByRole("heading", { name: "1 update", exact: true }).waitFor();
  await page
    .getByText("Publication date not supplied", { exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", {
      name: "Impact card · review prompts ▾",
      exact: true,
    })
    .click();
  await page.getByText("PV Info interpretation", { exact: false }).waitFor();
  const draft = new URL(
    await page
      .locator("#list a")
      .filter({ hasText: "Suggest a correction" })
      .getAttribute("href"),
  );
  assert.match(draft.searchParams.get("body"), /Update ID: mhra/);
  assert.ok(!draft.href.includes("email"));
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.getByLabel("Country or body", { exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await page.getByLabel("Topic", { exact: true }).isVisible(),
    true,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  mode = "fail";
  await page.reload();
  await page
    .getByRole("button", { name: "Retry loading updates", exact: true })
    .waitFor();
  assert.equal(await page.locator("[data-page-snapshot]").count(), 3);
  assert.match(await page.locator("#load-message").innerText(), /unfiltered/);
  assert.ok(!(await page.locator("#list").innerText()).includes("npm run"));
  mode = "ok";
  await page
    .getByRole("button", { name: "Retry loading updates", exact: true })
    .click();
  await page.getByRole("heading", { name: "3 updates", exact: true }).waitFor();
  mode = "bad";
  await page.reload();
  await page
    .getByRole("button", { name: "Retry loading updates", exact: true })
    .waitFor();
  mode = "empty";
  await page
    .getByRole("button", { name: "Retry loading updates", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "No updates in this snapshot", exact: true })
    .waitFor();
  mode = "ok";
  await page.goto("http://127.0.0.1:4173/status.html");
  await page
    .getByText("Feed status is available to signed-in site administrators.", {
      exact: false,
    })
    .waitFor();
  assert.equal(await page.locator("#status-content").isVisible(), false);
  assert.equal(statusReads, 0);
  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("heading", { name: "3 updates", exact: true }).waitFor();
  await page.evaluate(() => {
    window.fixtureRole = "member";
    dispatchEvent(
      new StorageEvent("storage", { key: "sb-synthetic-auth-token" }),
    );
  });
  assert.equal(await page.locator("#home-health").isVisible(), false);
  assert.equal(statusReads, 0);
  await page.evaluate(() => {
    window.fixtureRole = "admin";
    dispatchEvent(
      new StorageEvent("storage", { key: "sb-synthetic-auth-token" }),
    );
  });
  await page.locator("#home-health").waitFor({ state: "visible" });
  await page.getByText("1 of 2 sources reachable", { exact: false }).waitFor();
  assert.ok(statusReads > 0);
  await page.evaluate(() => {
    window.fixtureRole = "member";
    dispatchEvent(
      new StorageEvent("storage", { key: "sb-synthetic-auth-token" }),
    );
  });
  await page.locator("#home-health").waitFor({ state: "hidden" });
  await page.evaluate(() => localStorage.setItem("pv-test-role", "admin"));
  await page.goto("http://127.0.0.1:4173/status.html");
  await page.locator("#status-content").waitFor({ state: "visible" });
  await page.locator("#official tbody tr").first().waitFor();
  assert.equal(await page.locator("#official tbody tr").count(), 2);
  await page.evaluate(() => {
    window.fixtureRole = "member";
    localStorage.setItem("pv-test-role", "member");
    dispatchEvent(
      new StorageEvent("storage", { key: "sb-synthetic-auth-token" }),
    );
  });
  await page.locator("#status-content").waitFor({ state: "hidden" });
  const readsBeforeAbout = statusReads;
  await page.goto("http://127.0.0.1:4173/about.html");
  await page
    .getByRole("heading", { name: "About PV Info", exact: true })
    .waitFor();
  assert.equal(await page.locator(".freshness").count(), 0);
  assert.equal(statusReads, readsBeforeAbout);
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  await noJs.route("http://127.0.0.1:4173/", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  const staticPage = await noJs.newPage();
  await staticPage.goto("http://127.0.0.1:4173/");
  assert.equal(await staticPage.locator("[data-page-snapshot]").count(), 3);
  assert.equal(await staticPage.locator("#home-health").isVisible(), false);
  assert.equal(
    await staticPage.locator('a[href="status.html"]:visible').count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Homepage: public/member/admin diagnostics, legacy-setting bypass prevention, filter/reset/search/impact evidence, safe feedback draft, mobile, error/retry/malformed/empty feed and no-JavaScript snapshot passed.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
