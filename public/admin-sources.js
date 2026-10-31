// Admin → Data sources (admin-sources.html). The registry of everything the hourly build
// collects (supabase/schema.sql, "Data sources"). Admins add a source, test it, preview
// what it would give and activate it; edit one and test the change before it applies;
// pause and resume; see each source's collection health and recent results; and read or
// undo its history. Changes go through database functions that check the admin, the
// address and the test, and log who did what. Test now runs on the server (api/source-test.js).

import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";
import { ago } from "./lib.js";
import {
  SOURCE_TYPES, CLASSIFICATIONS, STATUSES, HEALTH, TOPICS, NEWS_PROVIDERS, label,
  cleanSource, sourceUrl, sourceHealth, staleReason, summaryCounts, placeholders, SECRET_NAME,
} from "./sources-lib.js";

const $ = (id) => document.getElementById(id);
const PERIODS = [
  { id: "1", label: "Last 24 hours" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
];
const CATCH_UP = [0, 1, 7, 14, 30, 60];
const CATEGORY = [["", "From the keyword rules"], ["safety", "Safety"], ["recall", "Recalls and quality"], ["label", "Label changes"], ["guideline", "Guidelines"], ["regulation", "Regulatory changes"], ["policy", "Policy"], ["inspection", "Inspections"], ["approval", "Approvals"]];

let sb = null;
let me = null;
let sources = [];
let stats = new Map();
let creds = new Map(); // source id → [{ name, updated_at, by_email }]
let snapshot = null; // data/sources/registry.json: what the last build collected from
let filter = { q: "", status: "", health: "", cls: "", type: "", period: "7", card: "" };
let panel = null; // { kind: "edit" | "test" | "status" | "history", id, ... }

const time = (iso) => (iso ? el("time", { datetime: iso, title: new Date(iso).toLocaleString() }, ago(new Date(iso))) : "never");
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const msg = (id) => el("p", { class: "hint", id, role: "status" });
const getJson = (url) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const health = (s) => sourceHealth(s, stats.get(s.id));
const byId = (id) => sources.find((s) => s.id === id);

async function load() {
  const since = new Date(Date.now() - Number(filter.period) * 86400000).toISOString();
  const [rows, st, cr] = await Promise.all([
    sb.from("data_sources").select("*").order("name"),
    sb.rpc("admin_source_stats", { since }),
    sb.rpc("admin_source_credentials"),
  ]);
  sources = check(rows).map(({ source_type, ...r }) => ({ ...r, type: source_type }));
  stats = new Map(check(st).map((x) => [x.source_id, x]));
  creds = new Map();
  for (const c of check(cr)) creds.set(c.source_id, [...(creds.get(c.source_id) ?? []), c]);
}

// Runs an action, shows its outcome, and reloads what it changed.
async function act(msgEl, fn, done = "Saved. It is used from the next build.") {
  msgEl.textContent = "Working…";
  try {
    await fn();
    await load();
    render();
    $("ad-msg").textContent = done;
  } catch (e) {
    msgEl.textContent = e.message || String(e);
  }
}

function open(p) {
  panel = p;
  render();
  $("ds-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  $("ds-panel")?.querySelector("input:not([type=hidden]):not([readonly]),select,textarea,button")?.focus();
}

// ── Summary cards and filters ───────────────────────────────────────────────

const CARDS = [
  ["", "configured", "Configured"],
  ["active", "active", "Active"],
  ["paused", "paused", "Paused"],
  ["failing", "failing", "Failing"],
  ["stale", "stale", "Stale"],
];

function cards() {
  const c = summaryCounts(sources, stats);
  return el("div", { class: "ds-cards", role: "group", "aria-label": "Summary" }, CARDS.map(([id, key, text]) =>
    el("button", { type: "button", class: `ds-card k-${key}`, "aria-pressed": String(filter.card === id), onclick: () => ((filter.card = id), render()) },
      el("b", {}, String(c[key])), el("span", {}, text),
      key === "configured" && c.draft ? el("small", {}, `${c.draft} draft`) : null,
      key === "failing" ? el("small", {}, "active, last run failed") : key === "stale" ? el("small", {}, "active, nothing recent") : null)));
}

function matches(s) {
  const h = health(s);
  if (filter.card === "active" && s.status !== "active") return false;
  if (filter.card === "paused" && s.status !== "paused") return false;
  if (filter.card === "failing" && !(s.status === "active" && h === "failed")) return false;
  if (filter.card === "stale" && !(s.status === "active" && h === "stale")) return false;
  if (filter.status && s.status !== filter.status) return false;
  if (filter.health && h !== filter.health) return false;
  if (filter.cls && s.classification !== filter.cls) return false;
  if (filter.type && s.type !== filter.type) return false;
  if (filter.q) {
    const hay = `${s.id} ${s.name} ${s.organization} ${s.url} ${s.settings?.query ?? ""} ${s.regions.join(" ")}`.toLowerCase();
    if (!filter.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function toolbar() {
  const select = (key, all, list) => el("select", { "aria-label": all, onchange: (e) => ((filter[key] = e.target.value), render()) },
    el("option", { value: "" }, all), list.map((x) => el("option", { value: x.id, selected: filter[key] === x.id || null }, x.label)));
  return el("div", { class: "row ds-tools" },
    el("input", { type: "search", placeholder: "Search name, address, query, country", "aria-label": "Search sources", value: filter.q, oninput: (e) => {
      filter.q = e.target.value;
      renderTable();
    } }),
    select("status", "Any status", STATUSES),
    select("health", "Any health", HEALTH),
    select("cls", "Any classification", CLASSIFICATIONS),
    select("type", "Any type", SOURCE_TYPES),
    el("select", { "aria-label": "Period for recent results", onchange: async (e) => {
      filter.period = e.target.value;
      $("ad-msg").textContent = "Loading…";
      await load();
      render();
      $("ad-msg").textContent = "";
    } }, PERIODS.map((p) => el("option", { value: p.id, selected: filter.period === p.id || null }, p.label))),
    el("button", { type: "button", class: "primary", onclick: () => open({ kind: "edit", id: null }) }, "Add a source"));
}

// ── The table ───────────────────────────────────────────────────────────────

const ORDER = { failed: 0, stale: 1, never: 2, successful: 3 };

function healthCell(s) {
  const st = stats.get(s.id);
  const h = health(s);
  const why = h === "failed" ? `${st.last_error ?? "Failed"}${st.failures_in_row > 1 ? ` · ${st.failures_in_row} runs in a row` : ""}` : h === "stale" ? staleReason(s, st) : "";
  // The first sentence under the badge; the whole message on hover and in History.
  const short = why.split(/(?<=\.) /)[0];
  return el("td", {}, el("span", { class: `ds-h h-${h}`, title: why || null }, label(HEALTH, h)), why ? el("div", { class: "hint", title: why }, short, h === "failed" && st.failures_in_row > 1 && short !== why ? ` · ${st.failures_in_row} in a row` : "") : null);
}

function urlCell(s) {
  if (s.type === "news_search") return el("td", { class: "ds-url" }, el("span", { class: "hint" }, `${label(NEWS_PROVIDERS, s.settings.provider ?? "google_news")}: `), el("code", {}, s.settings.query));
  return el("td", { class: "ds-url" }, el("code", { title: s.url }, s.url));
}

function row(s) {
  const st = stats.get(s.id);
  const btn = (text, onclick, extra = {}) => el("button", { type: "button", onclick, ...extra }, text);
  return el("tr", { class: health(s) === "failed" && s.status === "active" ? "st-bad" : "" },
    el("td", {}, el("b", {}, s.name), el("div", { class: "hint" }, s.id)),
    el("td", {}, s.organization || "—"),
    urlCell(s),
    el("td", {}, label(SOURCE_TYPES, s.type)),
    el("td", {}, label(CLASSIFICATIONS, s.classification)),
    el("td", {}, s.regions.length ? s.regions.join(", ") : el("span", { class: "hint" }, "Any (by mention)")),
    el("td", {}, s.topics.map((t) => label(TOPICS, t)).join(", ") || "—"),
    el("td", {}, el("span", { class: `ds-s s-${s.status}` }, label(STATUSES, s.status))),
    healthCell(s),
    el("td", { class: "ds-when" }, el("div", {}, "Tried ", time(st?.last_attempt)), el("div", {}, "OK ", time(st?.last_success))),
    el("td", { class: "ds-num" }, st ? `${st.items_seen} / ${st.items_kept}` : "—", st?.items_new ? el("div", { class: "hint" }, `${st.items_new} new`) : null, st ? el("div", { class: "hint" }, `${st.successes} of ${st.attempts} runs OK`) : null),
    el("td", {}, el("div", { class: "ds-acts" },
      btn("Edit", () => open({ kind: "edit", id: s.id })),
      btn("Test", () => runTest(s, { kind: "test", id: s.id })),
      s.status === "active" ? btn("Pause", () => open({ kind: "status", id: s.id, to: "paused" })) : s.status === "paused" ? btn("Resume", () => open({ kind: "status", id: s.id, to: "active" })) : null,
      btn("History", () => openHistory(s.id)))));
}

function renderTable() {
  const list = sources.filter(matches).sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || ORDER[health(a)] - ORDER[health(b)] || a.name.localeCompare(b.name));
  const period = label(PERIODS, filter.period).toLowerCase();
  $("ds-table")?.replaceChildren(
    el("p", { class: "hint" }, `${list.length} of ${sources.length} sources. Recent results are items collected / accepted in the ${period}.`),
    el("div", { class: "st-table-wrap" }, el("table", { class: "st-table ds-table" },
      el("thead", {}, el("tr", {}, ["Source", "Organization", "URL", "Type", "Classification", "Country/region", "Topics", "Status", "Health", "Last attempt / success", "Recent results", "Actions"].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, list.length ? list.map(row) : el("tr", {}, el("td", { colspan: 12 }, "No source matches these filters."))))));
}

// ── Add and edit ────────────────────────────────────────────────────────────

let form = null; // the source being edited, as typed so far
let lastTest = null; // { key, result }
let testSecrets = {}; // credentials typed for a test of a source not saved yet

// Settings compared by value, whatever order their keys come in (the database sorts them).
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const configKey = (s) => JSON.stringify(canon([s.type, s.type === "news_search" ? "" : s.url, s.settings ?? {}]));

function blank() {
  return { id: "", name: "", organization: "", type: "rss", classification: "regulator", regions: [], topics: [], status: "draft", url: "", settings: { relevance: "pv" }, notes: "" };
}

// The form's values in the registry's shape, cleaned exactly as the server cleans them,
// so the settings that are tested are the settings that are saved.
function readForm(f) {
  const v = (n) => f.elements[n]?.value?.trim() ?? "";
  const type = v("type");
  const settings = { relevance: f.elements.relevance.value };
  if (v("category")) settings.category = v("category");
  if (type === "news_search") {
    Object.assign(settings, { provider: v("provider") || "google_news", query: v("query") });
    if (v("hl") && v("hl") !== "en-US") settings.hl = v("hl");
    if (v("gl") && v("gl") !== "US") settings.gl = v("gl");
    if (v("window") !== "30d") settings.window = v("window");
  }
  if (type === "api") {
    settings.itemsPath = v("itemsPath");
    const fields = Object.fromEntries(["title", "link", "published", "summary"].map((k) => [k, v(`f_${k}`)]).filter(([k, x]) => x && x !== k));
    if (Object.keys(fields).length) settings.fields = fields;
  }
  if (type === "webpage" && v("linkPattern")) settings.linkPattern = v("linkPattern");
  const headers = Object.fromEntries(v("headers").split("\n").map((l) => l.split(/:\s*/)).filter((p) => p.length >= 2 && p[0].trim()).map(([k, ...rest]) => [k.trim(), rest.join(":").trim()]));
  if (type !== "news_search" && Object.keys(headers).length) settings.headers = headers;
  const raw = {
    id: panel.id ?? v("id"),
    name: v("name"),
    organization: v("organization"),
    type,
    classification: v("classification"),
    regions: v("regions").split(/[\s,]+/).filter(Boolean),
    topics: [...f.querySelectorAll("input[name=topics]:checked")].map((x) => x.value),
    status: form.status,
    url: v("url"),
    settings,
    notes: v("notes"),
  };
  return cleanSource(raw);
}

function testBlock(result, { compact = false } = {}) {
  if (!result) return null;
  if (result.pending) return el("div", { class: "ds-test" }, el("p", {}, "Testing…"));
  const head = result.ok ? `✓ Works: ${result.items} item${result.items === 1 ? "" : "s"} found, ${result.kept} would be kept` : `⚠ ${result.error ?? "The test failed."}`;
  return el("div", { class: `ds-test ${result.ok ? "ok" : "bad"}` },
    el("p", { class: "st-head" }, head),
    el("ul", { class: "ds-facts" },
      result.status != null ? el("li", {}, `Response: HTTP ${result.status}${result.contentType ? ` (${result.contentType})` : ""}`) : null,
      result.delivery ? el("li", {}, `Delivery: scheduled GitHub Actions collector · FDA fetched ${result.collectedAt}`) : null,
      result.format ? el("li", {}, `Detected format: ${{ rss: "RSS", atom: "Atom", xml: "XML", json: "JSON", html: "Web page (HTML)", unknown: "unknown" }[result.format] ?? result.format}`) : null,
      result.redirects?.length ? el("li", {}, `Redirected ${result.redirects.length}× to ${result.finalUrl}`) : null,
      result.newest ? el("li", {}, `Newest item ${result.newest.slice(0, 10)}${result.oldest ? `, oldest ${result.oldest.slice(0, 10)}` : ""}`) : null,
      result.ms != null ? el("li", {}, `Took ${(result.ms / 1000).toFixed(1)} s`) : null,
      result.stage === "fetch" && result.status == null ? el("li", {}, "Nothing was received from the address.") : null),
    result.samples?.length && !compact
      ? el("div", {}, el("strong", {}, "Sample records"),
          el("ol", { class: "ds-samples" }, result.samples.map((x) => el("li", {},
            el("a", { href: x.link, target: "_blank", rel: "noopener" }, x.title),
            el("span", { class: "hint" }, ` · ${x.published ? x.published.slice(0, 10) : "no date"}${x.source ? ` · ${x.source}` : ""} · `),
            x.kept ? el("span", { class: "ds-kept" }, `kept as ${x.category}${x.country ? `, ${x.country}` : ""}`) : el("span", { class: "hint" }, "left out (not about drug safety or regulation)")))))
      : null,
    result.ok && !result.recorded ? el("p", { class: "hint" }, "The test could not be recorded in the database, so the change can't be applied yet. Check that the deployment has the Supabase service key.") : null,
    result.ok && result.recorded && !compact ? el("p", { class: "hint" }, "This configuration passed and can be applied for the next 24 hours.") : null);
}

async function callTest(src, secrets = {}) {
  const { data } = await sb.auth.getSession();
  const res = await fetch("/api/source-test", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ source: { id: src.id, name: src.name, type: src.type, classification: src.classification, regions: src.regions, url: src.url, settings: src.settings }, secrets }),
  });
  const body = await res.json().catch(() => ({ error: `The test service answered HTTP ${res.status}.` }));
  if (!res.ok) return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  return body;
}

// Test now from the table: the saved configuration, as the build would collect it.
async function runTest(s, p) {
  panel = { ...p, result: { pending: true } };
  render();
  $("ds-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const result = await callTest(s).catch((e) => ({ ok: false, error: e.message }));
  if (panel?.id === s.id && panel.kind === "test") {
    panel.result = result;
    render();
  }
}

function credentialsBlock(id) {
  const list = id ? creds.get(id) ?? [] : [];
  const needed = placeholders(`${form.url ?? ""} ${Object.values(form.settings?.headers ?? {}).join(" ")}`);
  return el("fieldset", { class: "ds-creds" },
    el("legend", {}, "Credentials"),
    el("p", { class: "hint" }, "For a source that needs a key or token. Write {{NAME}} in the address or a header where it goes, e.g. ?api_key={{API_KEY}} or Authorization: Bearer {{TOKEN}}. Values are kept in the database, used only when collecting and testing, and never shown again."),
    list.length ? el("ul", { class: "members" }, list.map((c) => el("li", {}, el("span", {}, el("code", {}, c.name), el("span", { class: "hint" }, " · set ", time(c.updated_at), c.by_email ? ` by ${c.by_email}` : "")),
      el("button", { type: "button", class: "act", onclick: () => confirm(`Remove the credential ${c.name}?`) && act($("cred-msg"), async () => check(await sb.rpc("admin_set_source_secret", { sid: id, secret_name: c.name, secret_value: "" })), "Credential removed.") }, "Remove")))) : null,
    needed.length ? el("p", { class: "hint" }, `This address uses: ${needed.join(", ")}.`) : null,
    el("div", { class: "row" },
      el("input", { type: "text", name: "cred_name", placeholder: "NAME, e.g. API_KEY", "aria-label": "Credential name", pattern: "[A-Z][A-Z0-9_]{1,40}", autocomplete: "off" }),
      el("input", { type: "password", name: "cred_value", placeholder: "Value", "aria-label": "Credential value", autocomplete: "new-password" }),
      el("button", { type: "button", onclick: (e) => {
        const f = e.target.form;
        const n = f.elements.cred_name.value.trim().toUpperCase();
        const val = f.elements.cred_value.value;
        if (!SECRET_NAME.test(n) || !val) return void ($("cred-msg").textContent = "Give a NAME (capital letters, numbers, underscores) and a value.");
        if (!id) {
          testSecrets[n] = val;
          f.elements.cred_value.value = "";
          $("cred-msg").textContent = `${n} will be used for tests and saved with the source.`;
          return;
        }
        act($("cred-msg"), async () => check(await sb.rpc("admin_set_source_secret", { sid: id, secret_name: n, secret_value: val })), `Credential ${n} saved.`);
      } }, id ? "Save credential" : "Use for this source")),
    msg("cred-msg"));
}

function editPanel() {
  const existing = panel.id ? byId(panel.id) : null;
  if (!form) {
    form = existing ? structuredClone(existing) : blank();
    lastTest = null;
    testSecrets = {};
  }
  const s = form;
  const st = s.settings ?? {};
  const opt = (list, cur) => list.map((x) => el("option", { value: x.id, selected: cur === x.id || null }, x.label));
  const field = (text, input, hint) => el("label", { class: "ds-field" }, el("span", {}, text), input, hint ? el("span", { class: "hint" }, hint) : null);
  const remember = (e) => {
    const { source } = readForm(e.currentTarget);
    form = { ...form, ...source };
    const gen = e.currentTarget.querySelector("#ds-gen");
    if (gen) gen.value = source.url;
    const t = $("ds-tested");
    if (t) t.textContent = testedNote();
    for (const b of e.currentTarget.querySelectorAll("[data-needs-test]")) b.disabled = !canApply() || null;
  };
  const isNew = !existing;
  const draft = isNew || existing.status === "draft";
  const testedNote = () => (needsTest() ? (lastTest && lastTest.key === configKey(form) ? (lastTest.result.ok ? "✓ This configuration passed its test." : "⚠ The last test of this configuration failed.") : "Test this configuration before it can be applied.") : "");
  const f = el("form", { class: "imp-form ds-form", id: "ds-form", oninput: remember, onchange: (e) => {
    remember(e);
    if (e.target.name === "type") render();
  }, onsubmit: (e) => e.preventDefault() },
    el("strong", {}, isNew ? "Add a source" : `Edit ${existing.name}`),
    isNew ? null : el("p", { class: "hint" }, `Id ${existing.id} (permanent, so history is kept when the address changes) · ${label(STATUSES, existing.status)} · last changed `, time(existing.updated_at), existing.updated_by ? ` by ${existing.updated_by}` : ""),
    el("div", { class: "ds-grid" },
      field("Source name", el("input", { type: "text", name: "name", required: true, maxlength: 160, value: s.name, placeholder: "e.g. HPRA safety notices", oninput: (e) => {
        if (isNew && !e.currentTarget.form.elements.id.dataset.touched) e.currentTarget.form.elements.id.value = slug(e.target.value);
      } })),
      isNew ? field("Id", el("input", { type: "text", name: "id", required: true, maxlength: 60, pattern: "[a-z0-9]+(-[a-z0-9]+)*", value: s.id, oninput: (e) => (e.target.dataset.touched = "1") }), "Lower case and dashes. It never changes.") : null,
      field("Organization", el("input", { type: "text", name: "organization", maxlength: 160, value: s.organization, placeholder: "Regulator, publisher, repository or vendor" })),
      field("Source type", el("select", { name: "type" }, opt(SOURCE_TYPES, s.type))),
      field("Classification", el("select", { name: "classification" }, opt(CLASSIFICATIONS, s.classification)), "Official regulators are placed in their own country and ranked higher."),
      field("Country/region", el("input", { type: "text", name: "regions", value: s.regions.join(", "), placeholder: "e.g. IE or US, EU", title: "Two-letter codes, EU or INT, separated by commas" }), "The first is where official updates are placed. Leave empty to place items by what they mention.")),
    s.type === "news_search"
      ? el("fieldset", {}, el("legend", {}, "News search"),
          el("div", { class: "ds-grid" },
            field("Provider", el("select", { name: "provider" }, opt(NEWS_PROVIDERS, st.provider ?? "google_news"))),
            field("Language", el("input", { type: "text", name: "hl", value: st.hl ?? "en-US", size: 6 })),
            field("Edition country", el("input", { type: "text", name: "gl", value: st.gl ?? "US", size: 3 })),
            field("Time window", el("select", { name: "window" }, [["7d", "7 days"], ["30d", "30 days"]].map(([v, t]) => el("option", { value: v, selected: (st.window ?? "30d") === v || null }, t))))),
          field("Search query", el("textarea", { name: "query", rows: 2, required: true }, st.query ?? ""), "Edit the query; the address below is built from it."),
          field("Generated address", el("input", { type: "text", id: "ds-gen", readonly: true, value: sourceUrl(s), "aria-label": "Generated address" })))
      : field("URL", el("input", { type: "url", name: "url", required: true, value: s.url, placeholder: "https://…" }), "The exact feed, API or page address. Put keys in Credentials, never in the address."),
    s.type === "api" ? el("fieldset", {}, el("legend", {}, "Reading the API"),
      el("div", { class: "ds-grid" },
        field("Items path", el("input", { type: "text", name: "itemsPath", value: st.itemsPath ?? "", placeholder: "e.g. results or data.items" }), "Where the list of records is in the JSON. Empty for a top-level list."),
        ...["title", "link", "published", "summary"].map((k) => field(`${k[0].toUpperCase()}${k.slice(1)} field`, el("input", { type: "text", name: `f_${k}`, value: st.fields?.[k] ?? k }))))) : null,
    s.type === "webpage" ? field("Link pattern", el("input", { type: "text", name: "linkPattern", value: st.linkPattern ?? "", placeholder: "e.g. /safety-notices/" }), "Only links whose address matches this (a regular expression) are collected, titled by their link text.") : null,
    s.type !== "news_search" ? field("Request headers", el("textarea", { name: "headers", rows: 2, placeholder: "Authorization: Bearer {{TOKEN}}" }, Object.entries(st.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n")), "Optional, one per line.") : null,
    el("fieldset", {}, el("legend", {}, "What it covers"),
      el("div", { class: "r-boxes" }, TOPICS.map((t) => el("label", { class: "check" }, el("input", { type: "checkbox", name: "topics", value: t.id, checked: s.topics.includes(t.id) || null }), ` ${t.label}`)))),
    el("div", { class: "ds-grid" },
      el("div", { class: "ds-field" }, el("span", {}, "Keep"),
        el("label", { class: "check" }, el("input", { type: "radio", name: "relevance", value: "pv", checked: (st.relevance ?? "pv") === "pv" || null }), " Only items about drug safety or regulation"),
        el("label", { class: "check" }, el("input", { type: "radio", name: "relevance", value: "all", checked: st.relevance === "all" || null }), " Everything (for a dedicated safety feed)")),
      field("Default section", el("select", { name: "category" }, CATEGORY.map(([v, t]) => el("option", { value: v, selected: (st.category ?? "") === v || null }, t))), "Used when the keyword rules find nothing more specific."),
      field(isNew ? "Collect items from the last" : "If the address changes, collect from the last", el("select", { name: "catchup" }, CATCH_UP.map((d) => el("option", { value: d, selected: d === (isNew ? 30 : 7) || null }, d ? `${d} days` : "nothing older (from now on)"))), "Items already collected are recognised by their link and never added twice.")),
    field("Notes (for admins)", el("textarea", { name: "notes", rows: 2, maxlength: 2000 }, s.notes)),
    credentialsBlock(existing?.id),
    field("Why this change (kept in the history)", el("input", { type: "text", name: "why", maxlength: 500 })),
    el("div", { class: "row" },
      el("button", { type: "button", onclick: (e) => editTest(e.target.form) }, "Test now"),
      draft ? el("button", { type: "button", onclick: (e) => save(e.target.form, "draft") }, "Save as draft") : null,
      draft
        ? el("button", { type: "button", class: "primary", "data-needs-test": "", disabled: !canApply() || null, onclick: (e) => save(e.target.form, "active") }, "Save and activate")
        : el("button", { type: "button", class: "primary", "data-needs-test": "", disabled: !canApply() || null, onclick: (e) => save(e.target.form) }, "Save changes"),
      el("button", { type: "button", onclick: () => close() }, "Cancel"),
      el("span", { class: "hint", id: "ds-tested" }, testedNote())),
    msg("ed-msg"),
    el("div", { id: "ds-test-out" }, testBlock(lastTest?.key === configKey(form) ? lastTest.result : null)));
  return f;
}

// Whether the change needs a passing test before it can be applied: always for a
// source that will collect, unless only names, topics or notes changed.
function needsTest() {
  const existing = panel?.id ? byId(panel.id) : null;
  if (!existing || existing.status === "draft") return true;
  return configKey(existing) !== configKey(form);
}
const canApply = () => !needsTest() || Boolean(lastTest && lastTest.key === configKey(form) && lastTest.result.ok && lastTest.result.recorded);

async function editTest(f) {
  const { source, problems } = readForm(f);
  const fixable = problems.filter((p) => !/source id|name/.test(p));
  if (fixable.length) return void ($("ed-msg").textContent = fixable.join(" "));
  form = { ...form, ...source };
  $("ed-msg").textContent = "";
  $("ds-test-out").replaceChildren(testBlock({ pending: true }));
  const key = configKey(source);
  const result = await callTest(source, testSecrets).catch((e) => ({ ok: false, error: e.message }));
  lastTest = { key, result };
  if (panel?.kind !== "edit") return;
  $("ds-test-out").replaceChildren(testBlock(result));
  $("ds-tested").textContent = result.ok ? (result.recorded ? "✓ This configuration passed its test." : "") : "⚠ The last test of this configuration failed.";
  for (const b of f.querySelectorAll("[data-needs-test]")) b.disabled = !canApply() || null;
}

async function save(f, status) {
  const { source, problems } = readForm(f);
  if (problems.length) return void ($("ed-msg").textContent = problems.join(" "));
  const existing = panel.id ? byId(panel.id) : null;
  if (!existing && sources.some((s) => s.id === source.id)) return void ($("ed-msg").textContent = `A source with the id ${source.id} already exists.`);
  const src = { ...source, status: status ?? existing.status };
  const why = f.elements.why.value.trim();
  const secrets = existing ? {} : testSecrets;
  await act($("ed-msg"), async () => {
    check(await sb.rpc("admin_save_source", { src, creating: !existing, why: why || null, expected: existing?.updated_at ?? null, catch_up_days: Number(f.elements.catchup.value) }));
    for (const [n, v] of Object.entries(secrets)) check(await sb.rpc("admin_set_source_secret", { sid: src.id, secret_name: n, secret_value: v }));
    close(false);
  }, `${existing ? "Saved" : "Added"} ${src.name}${src.status === "active" ? ". It is collected from the next build." : " as a draft."}`);
}

function close(redraw = true) {
  panel = null;
  form = null;
  lastTest = null;
  testSecrets = {};
  if (redraw) render();
}

// ── Pause and resume ────────────────────────────────────────────────────────

function statusPanel() {
  const s = byId(panel.id);
  const pausing = panel.to === "paused";
  return el("form", { class: "imp-form", onsubmit: (e) => {
    e.preventDefault();
    const why = e.target.why.value.trim() || null;
    act($("st-msg"), async () => {
      check(await sb.rpc("admin_set_source_status", { sid: s.id, new_status: panel.to, why, catch_up_days: pausing ? 7 : Number(e.target.catchup.value) }));
      close(false);
    }, pausing ? `Paused ${s.name}. It is not collected from the next build; its earlier updates stay.` : `Resumed ${s.name}. It is collected again from the next build.`);
  } },
    el("strong", {}, `${pausing ? "Pause" : "Resume"} ${s.name}`),
    el("p", { class: "hint" }, pausing
      ? "The build stops collecting this source from its next run. Everything it collected stays on the site and in the archive, with its source. You can resume it at any time."
      : "Collection restarts at the next build. Updates it already collected are recognised by their link and never added twice; choose how far back to pick up what was published while it was paused."),
    pausing ? null : el("label", {}, "Catch up on items from the last ", el("select", { name: "catchup" }, CATCH_UP.map((d) => el("option", { value: d, selected: d === 7 || null }, d ? `${d} days` : "nothing (from now on)")))),
    el("label", {}, "Why (kept in the history) ", el("input", { type: "text", name: "why", maxlength: 500 })),
    el("div", { class: "row" }, el("button", { type: "submit", class: "primary" }, pausing ? "Pause source" : "Resume source"), el("button", { type: "button", onclick: () => close() }, "Cancel")),
    msg("st-msg"));
}

// ── History ─────────────────────────────────────────────────────────────────

async function openHistory(id) {
  open({ kind: "history", id, loading: true });
  try {
    const [events, runs, tests] = await Promise.all([
      sb.from("data_source_events").select("*").eq("source_id", id).order("at", { ascending: false }).limit(100),
      sb.from("data_source_runs").select("run_at,ok,http_status,format,error,items_seen,items_kept,items_new,attempts,duration_ms").eq("source_id", id).order("run_at", { ascending: false }).limit(72),
      sb.from("data_source_tests").select("at,ok,http_status,format,items,kept,error,by_email,url").eq("source_id", id).order("at", { ascending: false }).limit(10),
    ]);
    if (panel?.id !== id) return;
    panel = { kind: "history", id, events: check(events), runs: check(runs), tests: check(tests) };
  } catch (e) {
    panel = { kind: "history", id, error: e.message };
  }
  render();
}

const FIELD_LABELS = { name: "name", organization: "organization", url: "URL", source_type: "type", classification: "classification", regions: "regions", topics: "topics", status: "status", settings: "settings", notes: "notes", collect_from: "catch-up window" };

function diff(ev) {
  if (!ev.before) return ev.after ? el("div", { class: "hint" }, "Created with this configuration.") : null;
  const changed = Object.keys(FIELD_LABELS).filter((k) => JSON.stringify(ev.before[k] ?? null) !== JSON.stringify(ev.after?.[k] ?? null));
  return el("ul", { class: "ds-diff" }, changed.filter((k) => k !== "collect_from").map((k) => {
    const show = (v) => (k === "settings" ? JSON.stringify(v) : Array.isArray(v) ? v.join(", ") || "none" : String(v ?? "") || "empty");
    return el("li", {}, el("b", {}, FIELD_LABELS[k]), ": ", el("del", {}, show(ev.before[k])), " → ", el("ins", {}, show(ev.after?.[k])));
  }));
}

function historyPanel() {
  const s = byId(panel.id);
  const wrap = (...kids) => el("div", { class: "imp-form" }, el("div", { class: "row" }, el("strong", {}, `History of ${s.name}`), el("button", { type: "button", onclick: () => close() }, "Close")), ...kids);
  if (panel.loading) return wrap(el("p", {}, "Loading…"));
  if (panel.error) return wrap(el("p", {}, panel.error));
  const failures = panel.runs.filter((r) => !r.ok);
  return wrap(
    el("h3", {}, "Configuration changes"),
    el("ul", { class: "log ds-log" }, panel.events.map((ev) => el("li", {},
      time(ev.at), " ", el("b", {}, ev.action), el("span", { class: "hint" }, ` · ${ev.by_email ?? "system"}`), ev.note ? el("div", {}, ev.note) : null,
      diff(ev),
      ev.after && ev.action !== "imported"
        ? el("button", { type: "button", class: "act", onclick: () => confirm(ev.before ? "Undo this change? The source goes back to how it was just before it, and the undo is logged." : "Undo adding this source? It becomes a draft and stops being collected; its history stays.") && act($("hist-msg"), async () => {
            check(await sb.rpc("admin_revert_source", { event_id: ev.id, why: null }));
            await openHistory(s.id);
          }, "Undone. It is used from the next build.") }, "Undo")
        : null))),
    msg("hist-msg"),
    el("h3", {}, `Collection runs (last ${panel.runs.length})`),
    panel.runs.length
      ? el("div", { class: "st-table-wrap" }, el("table", { class: "st-table" },
          el("thead", {}, el("tr", {}, ["When", "Result", "Items found / kept / new", "Tries"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, panel.runs.map((r) => el("tr", { class: r.ok ? "" : "st-bad" },
            el("td", {}, time(r.run_at)),
            el("td", {}, r.ok ? `✓ OK${r.http_status ? ` · HTTP ${r.http_status}` : ""}${r.format ? ` · ${r.format}` : ""}` : `⚠ ${r.error ?? "Failed"}`),
            el("td", {}, `${r.items_seen} / ${r.items_kept} / ${r.items_new}`),
            el("td", {}, String(r.attempts)))))))
      : el("p", { class: "hint" }, "Not collected yet. Runs are recorded from the first build after the registry was set up."),
    failures.length ? el("p", { class: "hint" }, `${failures.length} of these runs failed. A failing source stays active and is retried every hour; after 6 failures in a row the hourly health check opens a GitHub issue.`) : null,
    el("h3", {}, "Tests"),
    panel.tests.length
      ? el("ul", { class: "log" }, panel.tests.map((t) => el("li", {}, time(t.at), " ", t.ok ? `✓ ${t.items} items, ${t.kept} kept` : `⚠ ${t.error ?? "failed"}`, el("span", { class: "hint" }, ` · ${t.by_email ?? ""}`))))
      : el("p", { class: "hint" }, "No tests yet."));
}

// ── Page ────────────────────────────────────────────────────────────────────

function panelView() {
  if (!panel) return null;
  if (panel.kind === "edit") return editPanel();
  if (panel.kind === "status") return statusPanel();
  if (panel.kind === "history") return historyPanel();
  if (panel.kind === "test") {
    const s = byId(panel.id);
    return el("div", { class: "imp-form" },
      el("div", { class: "row" }, el("strong", {}, `Test now: ${s.name}`), el("button", { type: "button", onclick: () => runTest(s, { kind: "test", id: s.id }) }, "Test again"), el("button", { type: "button", onclick: () => close() }, "Close")),
      el("p", { class: "hint" }, "The saved configuration, fetched now the way the hourly build does. Nothing is changed."),
      testBlock(panel.result));
  }
  return null;
}

function buildNote() {
  if (!snapshot) return null;
  const notes = [];
  if (snapshot.from !== "database") notes.push(`The last build (${new Date(snapshot.built).toLocaleString()}) used the ${snapshot.from === "repository" ? "initial import in the repository" : "registry from the build before it"}, not this list${snapshot.from === "repository" ? ". It switches over at the next build." : ", because the database could not be reached."}`);
  for (const p of snapshot.problems ?? []) notes.push(`${p.id} was skipped at the last build: ${p.problem}`);
  return notes.length ? el("div", {}, notes.map((n) => el("p", { class: "r-alert" }, n))) : null;
}

function render() {
  $("lede").textContent = `Signed in as ${me.email}. ${sources.length} sources configured. Changes are used from the next build.`;
  $("app").replaceChildren(
    cards(),
    buildNote(),
    toolbar(),
    el("div", { id: "ds-panel" }, panelView()),
    el("div", { id: "ds-table" }));
  renderTable();
}

async function main() {
  await cloud.navOnly();
  sb = await cloud.client();
  if (!sb) return void ($("lede").textContent = "This page needs the database, and this site was built without it.");
  me = await cloud.currentUser();
  if (!me) return void $("lede").replaceChildren("Sign in as an admin to use this page. ", el("a", { href: "account.html" }, "Sign in"), ".");
  const { data: isAdmin, error } = await sb.rpc("is_app_admin");
  if (error || !isAdmin) {
    $("lede").textContent = error ? `The admin features are not set up in the database yet (${error.message}).` : `Signed in as ${me.email}, which is not an admin.`;
    return;
  }
  snapshot = await getJson("data/sources/registry.json");
  try {
    await load();
  } catch (e) {
    $("lede").textContent = `The data source registry couldn't be loaded: ${e.message}. If this is the first time, run supabase/schema.sql again in the Supabase SQL Editor.`;
    return;
  }
  render();
  // "Set up a source connector" on Admin → Safety data resources opens a draft here,
  // prefilled from the resource. It is collected only after a passing test and activation.
  const q = new URLSearchParams(location.search);
  if (q.get("add")) {
    form = { ...blank(), id: slug(q.get("name") ?? ""), name: q.get("name") ?? "", organization: q.get("organization") ?? "", url: q.get("url") ?? "",
      regions: (q.get("regions") ?? "").split(",").filter((c) => /^[A-Z]{2,3}$/.test(c) && c !== "INT"), notes: q.get("resource") ? `Proposed from the safety data resource ${q.get("resource")}.` : "" };
    open({ kind: "edit", id: null });
    $("ad-msg").textContent = "A draft prefilled from the resource. Check the feed address, test it, and activate it only if it passes.";
  }
}

main();
