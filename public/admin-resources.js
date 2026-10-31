// Admin → Safety data resources (admin-resources.html). Maintains the Public Safety Data
// Resources directory (supabase/schema.sql, "Safety data resources"): add and edit
// resources, verify them, categorize them, flag broken links, publish, retire and
// restore them, read each one's history, and answer readers' suggestions and corrections.
// Changes go through database functions that check the admin and log who did what.
//
// The directory is separate from collection. Linking a resource to a data source only
// shows readers that PV Info already collects from it; "Set up a source connector"
// opens a draft on the Data sources page, which collects only after its own test.

import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";
import { ago } from "./lib.js";
import * as R from "./resources-lib.js";
import { fromRow } from "./resources-lib.js";

const $ = (id) => document.getElementById(id);
let sb = null;
let me = null;
let resources = [];
let sources = []; // data_sources: id, name, status
let inbox = [];
let published = null; // data/resources.json, what the last build published
let filter = { q: "", status: "", cat: "", attention: "" };
let panel = null; // { kind: "edit" | "history", id, prefill }

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const time = (iso) => (iso ? el("time", { datetime: iso, title: new Date(iso).toLocaleString() }, ago(new Date(iso))) : "never");
const byId = (id) => resources.find((r) => r.id === id);
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

async function load() {
  const [rows, src, fb] = await Promise.all([
    sb.from("safety_resources").select("*").order("name"),
    sb.from("data_sources").select("id,name,status").order("name"),
    sb.from("resource_feedback").select("*").order("created_at", { ascending: false }).limit(200),
  ]);
  resources = check(rows).map(fromRow);
  sources = check(src);
  inbox = check(fb);
}

async function act(fn, done = "Saved. The public page changes at the next build.") {
  $("ad-msg").textContent = "Working…";
  try {
    await fn();
    await load();
    render();
    $("ad-msg").textContent = done;
  } catch (e) {
    $("ad-msg").textContent = e.message || String(e);
  }
}

const ask = (q, def = "") => {
  const v = prompt(q, def);
  return v === null ? null : v.trim();
};

function open(p) {
  panel = p;
  render();
  $("rs-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Summary and filters ─────────────────────────────────────────────────────

const ATTENTION = [
  { id: "broken", label: "Link flagged broken", test: (r) => r.linkStatus === "broken" },
  { id: "editor", label: "Awaiting editor review", test: (r) => r.status === "published" && r.verified?.method !== "editor" },
  { id: "due", label: `Review due (over ${R.REVIEW_MONTHS} months)`, test: (r) => r.status === "published" && R.reviewDue(r) },
  { id: "unverified", label: "Never verified", test: (r) => !r.verified },
];

function summary() {
  const n = (f) => resources.filter(f).length;
  const waiting = inbox.filter((x) => x.status === "open").length;
  const card = (count, text, onclick) => el("button", { type: "button", class: "ds-card", onclick }, el("b", {}, String(count)), el("span", {}, text));
  return el("div", { class: "ds-cards", role: "group", "aria-label": "Summary" },
    card(n((r) => r.status === "published"), "Published", () => setFilter({ status: "published", attention: "" })),
    card(n((r) => r.status === "draft"), "Drafts", () => setFilter({ status: "draft", attention: "" })),
    card(n((r) => r.status === "retired"), "Retired", () => setFilter({ status: "retired", attention: "" })),
    card(n(ATTENTION[0].test), "Broken links", () => setFilter({ status: "", attention: "broken" })),
    card(n(ATTENTION[1].test), "Awaiting editor review", () => setFilter({ status: "", attention: "editor" })),
    card(waiting, "Open reader messages", () => $("rs-inbox")?.scrollIntoView({ behavior: "smooth" })));
}

const setFilter = (p) => ((filter = { ...filter, ...p }), render());

function matches(r) {
  if (filter.status && r.status !== filter.status) return false;
  if (filter.cat && !r.categories.includes(filter.cat)) return false;
  if (filter.attention && !ATTENTION.find((a) => a.id === filter.attention).test(r)) return false;
  if (filter.q) {
    const hay = `${r.id} ${r.name} ${r.organization} ${r.url} ${r.countries.join(" ")} ${r.keywords.join(" ")}`.toLowerCase();
    if (!filter.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function toolbar() {
  const sel = (key, all, list) => el("select", { "aria-label": all, onchange: (e) => setFilter({ [key]: e.target.value }) },
    el("option", { value: "" }, all), list.map((x) => el("option", { value: x.id, selected: filter[key] === x.id || null }, x.label)));
  return el("div", { class: "row ds-tools" },
    el("input", { type: "search", placeholder: "Search name, organization, link, country", "aria-label": "Search resources", value: filter.q, oninput: (e) => {
      filter.q = e.target.value;
      renderTable();
    } }),
    sel("status", "Any status", R.STATUSES),
    sel("cat", "Any category", R.CATEGORIES.map((c) => ({ id: c.id, label: c.short }))),
    sel("attention", "Anything", ATTENTION),
    el("button", { type: "button", class: "primary", onclick: () => open({ kind: "edit", id: null }) }, "Add a resource"));
}

// ── The table ───────────────────────────────────────────────────────────────

function verifiedCell(r) {
  if (!r.verified) return el("td", {}, el("span", { class: "warn" }, "Not verified"));
  return el("td", {}, r.verified.on, el("div", { class: "hint" }, r.verified.method === "editor" ? `by ${r.verifiedBy ?? "an editor"}` : "automated check, needs editor review"),
    R.reviewDue(r) ? el("div", { class: "warn" }, "Review due") : null);
}

function sourceCell(r) {
  if (!r.sourceId) return el("td", {}, el("span", { class: "hint" }, "Reference only"));
  const s = sources.find((x) => x.id === r.sourceId);
  return el("td", {}, el("a", { href: `admin-sources.html` }, s?.name ?? r.sourceId), el("div", { class: "hint" }, s ? (s.status === "active" ? "collected" : `source ${s.status}, not collected`) : "source missing"));
}

function row(r) {
  const btn = (text, onclick) => el("button", { type: "button", onclick }, text);
  return el("tr", { class: r.linkStatus === "broken" ? "st-bad" : "" },
    el("td", {}, el("b", {}, el("a", { href: r.url, target: "_blank", rel: "noopener" }, r.name)), el("div", { class: "hint" }, r.id)),
    el("td", {}, r.organization),
    el("td", {}, r.categories.map((c) => R.CATEGORIES.find((x) => x.id === c)?.short).join(", "), r.specialties.length ? el("div", { class: "hint" }, r.specialties.map((s) => R.label(R.SPECIALTIES, s)).join(", ")) : null),
    el("td", {}, r.countries.join(", ")),
    el("td", {}, el("span", { class: `ds-s s-${r.status === "published" ? "active" : r.status === "retired" ? "paused" : "draft"}` }, R.label(R.STATUSES, r.status))),
    el("td", {}, r.linkStatus === "broken" ? el("span", { class: "warn", title: r.linkNote || null }, "Broken") : "OK", r.linkNote ? el("div", { class: "hint" }, r.linkNote) : null),
    verifiedCell(r),
    sourceCell(r),
    el("td", {}, el("div", { class: "ds-acts" },
      btn("Edit", () => open({ kind: "edit", id: r.id })),
      btn("Verify", () => {
        const note = ask(`Verify ${r.name}: you have opened the official link today and checked access, coverage and limitations. Note (optional):`);
        if (note !== null) act(async () => check(await sb.rpc("admin_verify_resource", { rid: r.id, note })), "Verified today.");
      }),
      r.linkStatus === "broken"
        ? btn("Clear flag", () => act(async () => check(await sb.rpc("admin_flag_resource_link", { rid: r.id, broken: false, note: "" }))))
        : btn("Flag broken", () => {
          const note = ask(`What is wrong with the link for ${r.name}?`, "Link does not open");
          if (note !== null) act(async () => check(await sb.rpc("admin_flag_resource_link", { rid: r.id, broken: true, note })));
        }),
      r.status === "published"
        ? btn("Unpublish", () => act(async () => check(await sb.rpc("admin_set_resource_status", { rid: r.id, new_status: "draft", why: ask("Why? (optional)") ?? "" }))))
        : r.status === "draft" ? btn("Publish", () => act(async () => check(await sb.rpc("admin_set_resource_status", { rid: r.id, new_status: "published", why: "" })))) : null,
      r.status === "retired"
        ? btn("Restore", () => act(async () => check(await sb.rpc("admin_set_resource_status", { rid: r.id, new_status: "draft", why: "restored" })), "Restored as a draft."))
        : btn("Retire", () => {
          const why = ask(`Retire ${r.name}? It leaves the public directory; its history is kept. Reason:`);
          if (why !== null) act(async () => check(await sb.rpc("admin_set_resource_status", { rid: r.id, new_status: "retired", why })));
        }),
      btn("History", () => openHistory(r.id)))));
}

function renderTable() {
  const list = resources.filter(matches);
  $("rs-table")?.replaceChildren(
    el("p", { class: "hint" }, `${list.length} of ${resources.length} resources.`),
    el("div", { class: "st-table-wrap" }, el("table", { class: "st-table ds-table" },
      el("thead", {}, el("tr", {}, ["Resource", "Maintained by", "Category", "Countries", "Status", "Link", "Last verified", "Collection", "Actions"].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, list.length ? list.map(row) : el("tr", {}, el("td", { colspan: 9 }, "No resource matches these filters."))))));
}

// ── Add and edit ────────────────────────────────────────────────────────────

const lines = (s) => String(s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const commas = (s) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

// `prev` keeps the order of categories already chosen, since the first is the main one.
function readForm(f, prev = []) {
  const v = (n) => f.elements[n]?.value ?? "";
  const checked = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map((x) => x.value);
  return {
    id: v("id").trim(), name: v("name"), organization: v("organization"),
    categories: [...prev.filter((c) => checked("categories").includes(c)), ...checked("categories").filter((c) => !prev.includes(c))], specialties: checked("specialties"), products: checked("products"),
    countries: commas(v("countries")).map((c) => c.toUpperCase()), purpose: v("purpose"),
    coverage: { countries: v("cov_countries"), products: v("cov_products"), reportTypes: v("cov_reportTypes"), years: v("cov_years") },
    access: { publicAccess: v("publicAccess"), search: f.elements.search.checked, download: v("download"), api: v("api"), note: v("access_note") },
    reuse: { status: v("reuse"), note: v("reuse_note") },
    limitations: v("limitations"), url: v("url").trim(),
    links: lines(v("links")).map((l) => {
      const [label, ...rest] = l.split("|");
      return { label: label.trim(), url: rest.join("|").trim() };
    }),
    sourceId: v("sourceId") || null, keywords: commas(v("keywords")),
  };
}

function editPanel() {
  const existing = panel.id ? byId(panel.id) : null;
  const r = existing ?? { categories: [], specialties: [], products: [], countries: [], coverage: {}, access: { publicAccess: "open", search: true, download: "unknown", api: "unknown" }, reuse: { status: "unknown" }, links: [], keywords: [], ...panel.prefill };
  const text = (name, value, attrs = {}) => el("input", { name, value: value ?? "", ...attrs });
  const area = (name, value, rows = 2) => el("textarea", { name, rows }, value ?? "");
  const field = (label, input, hint, wide) => el("label", { class: `ds-field${wide ? " wide" : ""}` }, el("span", {}, label), input, hint ? el("span", { class: "hint" }, hint) : null);
  const boxes = (legend, name, list, chosen) => el("fieldset", {}, el("legend", {}, legend), el("div", { class: "pf-checks" },
    list.map((x) => el("label", { class: "pf-check" }, el("input", { type: "checkbox", name, value: x.id, checked: chosen.includes(x.id) || null }), x.label))));
  const opts = (list, cur) => list.map((x) => el("option", { value: x.id, selected: cur === x.id || null }, x.label));
  const status = el("p", { class: "hint", role: "status" });
  const connector = existing && !existing.sourceId
    ? el("p", { class: "hint wide" }, "PV Info does not collect from this resource. If it publishes a feed or API worth collecting, ",
      el("a", { href: `admin-sources.html?${new URLSearchParams({ add: "1", name: existing.name, organization: existing.organization, url: existing.url, regions: existing.countries.join(","), resource: existing.id })}` }, "set up a source connector"),
      ": it opens as a draft in Data sources and is collected only after a passing test and activation there.")
    : null;
  const save = async (form, verify) => {
    const res = readForm(form, existing?.categories);
    if (!panel.id && !res.id) res.id = slug(res.name);
    const { problems } = R.cleanResource({ ...res, status: "draft" });
    if (problems.length) return void (status.textContent = problems.join(" "));
    const why = form.elements.why.value;
    status.textContent = "Saving…";
    try {
      check(await sb.rpc("admin_save_resource", { res, creating: !panel.id, why, expected: existing?.updatedAt ?? null }));
      if (verify) check(await sb.rpc("admin_verify_resource", { rid: res.id, note: why }));
      if (panel.feedbackId) check(await sb.rpc("admin_answer_feedback", { fid: panel.feedbackId, new_status: "done", reply: `Added as ${res.id}` }));
      panel = null;
      await load();
      render();
      $("ad-msg").textContent = `Saved ${res.name}${verify ? " and verified it today" : ""}.${existing ? "" : " New resources start as drafts: publish it once verified."}`;
    } catch (e) {
      status.textContent = e.message || String(e);
    }
  };
  const form = el("form", { class: "rs-admin-form", onsubmit: (e) => {
    e.preventDefault();
    save(e.currentTarget, e.submitter?.value === "verify");
  } },
    field("Name", text("name", r.name, { required: true, maxlength: 160 })),
    field("Id", text("id", r.id, { readonly: existing ? true : null, pattern: "[a-z0-9]+(-[a-z0-9]+)*", placeholder: "made from the name" }), existing ? "The id never changes." : "Lower-case letters, numbers and dashes."),
    field("Maintained by (organization)", text("organization", r.organization, { required: true, maxlength: 200 }), null, true),
    field("Official link", text("url", r.url, { type: "url", required: true }), "The resource's own page at the maintaining organization.", true),
    field("Purpose: what question does it help answer?", area("purpose", r.purpose), null, true),
    boxes(existing ? `Categories (main: ${R.CATEGORIES.find((c) => c.id === existing.categories[0])?.short}; untick it to change)` : "Categories (the first in this list becomes the main one)", "categories", R.CATEGORIES, r.categories),
    boxes("Specialist areas", "specialties", R.SPECIALTIES, r.specialties),
    boxes("Products", "products", R.PRODUCTS, r.products),
    field("Countries", text("countries", r.countries.join(", ")), "Codes, comma separated: US, EU, JP; INT for international."),
    el("fieldset", { class: "wide" }, el("legend", {}, "Data coverage"), el("div", { class: "rs-admin-form" },
      field("Countries covered", text("cov_countries", r.coverage.countries)), field("Products covered", text("cov_products", r.coverage.products)),
      field("Report or document types", text("cov_reportTypes", r.coverage.reportTypes)), field("Years available", text("cov_years", r.coverage.years)))),
    el("fieldset", { class: "wide" }, el("legend", {}, "Access, downloads and reuse (recorded separately)"), el("div", { class: "rs-admin-form" },
      field("Who can access", el("select", { name: "publicAccess" }, opts(R.PUBLIC_ACCESS, r.access.publicAccess))),
      el("label", { class: "pf-check" }, el("input", { type: "checkbox", name: "search", checked: r.access.search || null }), "Public search"),
      field("Downloads", el("select", { name: "download" }, opts(R.DOWNLOAD, r.access.download))),
      field("API", el("select", { name: "api" }, opts(R.API, r.access.api))),
      field("Access details", area("access_note", r.access.note), null, true),
      field("Permission to reuse data", el("select", { name: "reuse" }, opts(R.REUSE, r.reuse.status))),
      field("Reuse terms", area("reuse_note", r.reuse.note)))),
    field("Limitations and interpretation cautions", area("limitations", r.limitations, 3), null, true),
    field("Extra links", area("links", r.links.map((l) => `${l.label} | ${l.url}`).join("\n")), "One per line: Label | https://…", true),
    field("Search words", text("keywords", r.keywords.join(", ")), "Other names and abbreviations, comma separated."),
    field("Collected through data source", el("select", { name: "sourceId" }, el("option", { value: "" }, "None (reference only)"),
      sources.map((s) => el("option", { value: s.id, selected: r.sourceId === s.id || null }, `${s.name} (${s.status})`))),
      "Only shows readers that PV Info already collects from it. It never starts collection."),
    connector,
    field("Note for the history", text("why", panel.prefill?.why ?? ""), "Why you made this change; where you checked it.", true),
    el("div", { class: "row wide" },
      el("button", { type: "submit", class: "primary", value: "verify" }, "Save and verify"),
      el("button", { type: "submit", value: "save" }, "Save"),
      el("button", { type: "button", onclick: () => ((panel = null), render()) }, "Cancel"),
      status),
    el("p", { class: "hint wide" }, "Save and verify records that you opened the official link today and checked these details."));
  return el("section", { class: "profile", id: "rs-panel" }, el("h2", {}, existing ? `Edit ${existing.name}` : "Add a resource"), form);
}

async function openHistory(id) {
  panel = { kind: "history", id, events: null };
  render();
  try {
    panel.events = check(await sb.from("safety_resource_events").select("id,action,note,by_email,at").eq("resource_id", id).order("at", { ascending: false }).limit(100));
  } catch (e) {
    panel.events = [];
    $("ad-msg").textContent = e.message;
  }
  render();
}

function historyPanel() {
  const r = byId(panel.id);
  return el("section", { class: "profile", id: "rs-panel" }, el("h2", {}, `History of ${r?.name ?? panel.id}`),
    panel.events === null ? el("p", {}, "Loading…") : el("ul", { class: "ds-log" }, panel.events.map((e) => el("li", {}, el("b", {}, e.action), " · ", e.by_email ?? "", " · ", time(e.at), e.note ? el("div", { class: "hint" }, e.note) : null))),
    el("button", { type: "button", onclick: () => ((panel = null), render()) }, "Close"));
}

// ── Reader messages ─────────────────────────────────────────────────────────

function inboxSection() {
  const waiting = inbox.filter((x) => x.status === "open");
  const done = inbox.filter((x) => x.status !== "open").slice(0, 20);
  const answer = (m, new_status) => {
    const reply = ask(new_status === "declined" ? "Why is it declined? (kept with the message)" : "Note (kept with the message):", "") ?? null;
    if (reply !== null) act(async () => check(await sb.rpc("admin_answer_feedback", { fid: m.id, new_status, reply })), "Message updated.");
  };
  const item = (m) => {
    const r = m.resource_id ? byId(m.resource_id) : null;
    return el("li", {},
      el("b", {}, m.kind === "suggest" ? `Suggestion: ${m.name}` : `Correction: ${r?.name ?? m.resource_id ?? "a resource no longer listed"}`), " · ", time(m.created_at),
      m.url ? el("div", {}, el("a", { href: m.url, target: "_blank", rel: "noopener noreferrer" }, m.url)) : null,
      el("p", {}, m.message),
      m.contact ? el("p", { class: "hint" }, `Reply to: ${m.contact}`) : null,
      m.status === "open" ? el("div", { class: "ds-acts" },
        m.kind === "suggest"
          ? el("button", { type: "button", onclick: () => open({ kind: "edit", id: null, feedbackId: m.id, prefill: { name: m.name, url: m.url, why: `Suggested by a reader on ${m.created_at.slice(0, 10)}` } }) }, "Start a draft from this")
          : r ? el("button", { type: "button", onclick: () => open({ kind: "edit", id: r.id, prefill: { why: `Correction from a reader on ${m.created_at.slice(0, 10)}` } }) }, "Edit the resource") : null,
        el("button", { type: "button", onclick: () => answer(m, "done") }, "Mark done"),
        el("button", { type: "button", onclick: () => answer(m, "declined") }, "Decline"))
        : el("p", { class: "hint" }, `${m.status === "done" ? "Done" : "Declined"} by ${m.handled_by ?? "?"} ${m.handled_at ? ago(new Date(m.handled_at)) : ""}${m.reply ? `: ${m.reply}` : ""}`));
  };
  return el("section", { class: "profile", id: "rs-inbox" }, el("h2", {}, `Reader suggestions and corrections (${waiting.length} open)`),
    el("p", { class: "hint" }, "Sent from the public directory without sign-in, at most five an hour from one address. Check every suggestion against the official source before adding it."),
    waiting.length ? el("ul", { class: "rs-inbox" }, waiting.map(item)) : el("p", {}, "No open messages."),
    done.length ? el("details", {}, el("summary", {}, "Recently answered"), el("ul", { class: "rs-inbox" }, done.map(item))) : null);
}

function render() {
  const live = published ? `The public page last published ${published.total} resources (${published.from === "database" ? "from this list" : published.from === "repository" ? "from the repository's initial list; it switches to this list at the next build" : "from the build before, because the database could not be reached"}), ${ago(new Date(published.built))}.` : "The public page has not been built yet.";
  $("lede").textContent = `${live} Only published, verified resources appear there.`;
  $("app").replaceChildren(...[
    summary(),
    panel?.kind === "edit" ? editPanel() : panel?.kind === "history" ? historyPanel() : null,
    toolbar(),
    el("div", { id: "rs-table" }),
    inboxSection(),
  ].filter(Boolean));
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
  published = await fetch("data/resources.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  try {
    await load();
  } catch (e) {
    $("lede").textContent = `The resource directory couldn't be loaded: ${e.message}. If this is the first time, run supabase/schema.sql again in the Supabase SQL Editor.`;
    return;
  }
  render();
}

main();
