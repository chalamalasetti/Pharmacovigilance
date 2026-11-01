// The Admin console (admin.html). Signed-in app admins (supabase/schema.sql:
// research_admins) approve the company list, add, edit or hide companies, answer
// company requests, manage who is an admin, see failing data sources and the research
// review backlog, and publish. Everything is saved in the database; the build applies
// it over the repo files (scripts/admin.mjs) and reports back in data/companies/admin.json.

import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";
import { ago, dataHealth } from "./lib.js";
import { REVIEW_QUEUES } from "./research-lib.js";

const $ = (id) => document.getElementById(id);
const FIELDS_LIST = [
  ["aliases", "Other names people search for", "Search only. One per line."],
  ["former", "Former names", "One per line."],
  ["mentions", "Phrases that identify it in news and papers", "Exact and case-sensitive. Keep them specific, so a common word does not match. One per line. Left empty for a new company, its name is used."],
  ["holders", "Authorisation-holder names in FDA and EMA records", "Name prefixes, one per line, e.g. ACME PHARMA. Products are linked at the weekly registry refresh."],
];

let sb = null;
let me = null;
let live = null; // data/companies/admin.json: what the site applied at its last build
let status = null;
let research = null;
let resourcesPub = null; // data/resources.json: the public directory as last built
let db = { approvals: [], overrides: [], requests: [], admins: [], events: [], publish: null, settings: [] };
let editing = null; // { id, isNew, request }
let site = null; // data/site.json: the menu and status-strip settings the site uses now
let menu = null; // the menu being arranged: { order, hidden }

// The menu's pages ("index" is Updates); keep in step with NAV in scripts/admin.mjs.
const NAV_LABELS = { index: "Updates", briefing: "My Briefing", research: "Research", resources: "Resources", companies: "Companies", "action-center": "Action Center", team: "Team", archive: "Archive", globe: "Globe", agencies: "Agencies", about: "About" };

const time = (iso) => (iso ? el("time", { datetime: iso, title: new Date(iso).toLocaleString() }, ago(new Date(iso))) : "never");
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const lines = (s) => [...new Set(String(s ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean))];
const norm = (x) => (Array.isArray(x) ? [...x].sort() : x ?? null);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const getJson = (url) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const companyName = (id) => live?.companies.find((c) => c.id === id)?.name ?? live?.hidden?.find((c) => c.id === id)?.name ?? db.overrides.find((o) => o.company_id === id)?.data?.name ?? id;

// Runs an action, shows its outcome next to the button, and reloads what it changed.
async function act(msgEl, fn, done = "Saved. It goes live at the next build.") {
  msgEl.textContent = "Working…";
  try {
    await fn();
    await load();
    render();
    // The button's message line may have gone with the re-render (a closed form).
    ((msgEl.id && $(msgEl.id)) || $("ad-msg")).textContent = done;
  } catch (e) {
    msgEl.textContent = e.message || String(e);
  }
}
const check = ({ error }) => {
  if (error) throw error;
};
const msg = (id) => el("p", { class: "hint", id, role: "status" });

async function load() {
  const [approvals, overrides, requests, admins, events, publish, settings] = await Promise.all([
    sb.from("manifest_approvals").select("version,status,approved_by,approved_on,note,updated_at"),
    sb.from("company_overrides").select("company_id,data,hidden,note,updated_at").order("updated_at", { ascending: false }),
    sb.from("company_requests").select("*").order("created_at", { ascending: false }).limit(100),
    sb.rpc("admin_list_admins"),
    sb.from("admin_events").select("action,target,detail,by_email,at").order("at", { ascending: false }).limit(40),
    sb.rpc("admin_publish_status"),
    sb.from("site_settings").select("key,value,updated_at"),
  ]);
  for (const r of [approvals, overrides, requests, admins, events]) check(r);
  db = { approvals: approvals.data, overrides: overrides.data, requests: requests.data, admins: admins.data, events: events.data, publish: publish.error ? null : publish.data, settings: settings.error ? [] : settings.data };
}

// ── Publish ─────────────────────────────────────────────────────────────────

function pendingChanges() {
  const built = live?.built ?? "";
  return [...db.approvals, ...db.overrides, ...db.settings].filter((x) => x.updated_at > built).length;
}

function publishSection() {
  const p = db.publish;
  const pending = pendingChanges();
  const built = status?.checked ?? live?.built;
  return el("section", { class: "profile", id: "publish" },
    el("h2", {}, "Publish"),
    el("p", {}, `The site was last built `, time(built), `. `, pending ? el("b", {}, `${pending} saved change${pending > 1 ? "s are" : " is"} not live yet. `) : "Everything saved here is live. ",
      "The site rebuilds every hour (at about 17 minutes past), and a build takes a few minutes."),
    p?.hook
      ? el("div", { class: "row" },
          el("button", { type: "button", class: "primary", onclick: (e) => act($("pub-msg"), async () => check(await sb.rpc("admin_publish")), "Rebuild started. The site updates in a few minutes; reload this page then.") }, "Publish now"),
          el("span", { class: "hint" }, "Last used ", time(p.lastPublish)))
      : null,
    msg("pub-msg"),
    el("details", { class: "st-more" },
      el("summary", {}, p?.hook ? "Change or turn off the Publish now button" : "Set up a Publish now button"),
      el("p", { class: "hint" }, "In Vercel, open the pharmacovigilance project → Settings → Git → Deploy Hooks, create a hook named “Admin publish” for the main branch, and paste its URL here. It is kept in the database and never sent back to a browser. Leave it empty and save to turn the button off."),
      el("form", { class: "row", onsubmit: (e) => (e.preventDefault(), act($("hook-msg"), async () => check(await sb.rpc("admin_set_deploy_hook", { hook: e.target.hook.value })), "Saved.")) },
        el("input", { type: "url", name: "hook", placeholder: "https://api.vercel.com/v1/integrations/deploy/…", "aria-label": "Vercel deploy hook URL", style: "flex:1;min-width:240px" }),
        el("button", { type: "submit" }, "Save")),
      msg("hook-msg")),
  );
}

// ── Company list approval ───────────────────────────────────────────────────

function approvalSection() {
  const m = live.manifest;
  const row = db.approvals.find((a) => a.version === m.version);
  const approved = row?.status === "approved";
  const changes = live.applied;
  return el("section", { class: "profile", id: "approval" },
    el("h2", {}, "Company list approval"),
    el("p", {}, `Coverage list version ${m.version}: ${m.repoCompanies} companies in the repository file`,
      changes.added.length || changes.hidden.length ? `, ${m.companies} on the site after your changes (${changes.added.length} added, ${changes.hidden.length} hidden)` : "", ". ",
      "On the site it is ", el("b", {}, m.status === "approved" ? `approved${m.approvedBy ? ` by ${m.approvedBy}` : ""}${m.approvedOn ? ` on ${m.approvedOn}` : ""}` : "a draft awaiting approval"), ". ",
      el("a", { href: "companies.html" }, "Review the list")),
    approved
      ? el("div", { class: "imp-form" },
          el("p", {}, `✓ You approved this version as ${row.approved_by} on ${row.approved_on}.`, row.note ? ` Note: ${row.note}` : ""),
          el("div", { class: "row" }, el("button", { type: "button", onclick: () => confirm("Withdraw the approval? The site shows the list as a draft again.") && act($("ap-msg"), async () => check(await sb.rpc("admin_set_manifest_approval", { v: m.version, approve: false }))) }, "Withdraw approval")),
          msg("ap-msg"))
      : el("form", { class: "imp-form", onsubmit: (e) => (e.preventDefault(), act($("ap-msg"), async () => check(await sb.rpc("admin_set_manifest_approval", { v: m.version, approve: true, approver: null, why: e.target.why.value })))) },
          el("p", { class: "hint" }, "Approving sets status, approved by and the date for this version, so the draft notice comes off the Companies pages. If the repository file changes to a new version later, that version needs its own approval."),
          el("div", { class: "row" },
            el("label", {}, "Note ", el("input", { type: "text", name: "why", maxlength: 1000, placeholder: "Optional" }))),
          el("div", { class: "row" }, el("button", { type: "submit", class: "primary" }, `Approve version ${m.version}`)),
          msg("ap-msg")),
  );
}

// ── Companies: requests, admin changes and the editor ───────────────────────

function startEdit(id, request = null) {
  editing = id ? { id, isNew: false } : { id: null, isNew: true, request };
  render();
  $("co-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  $("co-form")?.querySelector("input:not([type=hidden]),select")?.focus();
}

function editor() {
  if (!editing) {
    const ids = live.companies.map((c) => c.id);
    return el("div", { class: "imp-form" },
      el("div", { class: "row" },
        el("button", { type: "button", class: "primary", onclick: () => startEdit(null) }, "Add a company"),
        el("label", {}, "or edit ",
          el("input", { type: "text", list: "co-names", placeholder: "Company name", "aria-label": "Company to edit", onchange: (e) => {
            const c = live.companies.find((x) => x.name.toLowerCase() === e.target.value.trim().toLowerCase() || x.id === e.target.value.trim());
            if (c) startEdit(c.id);
          } })),
        el("datalist", { id: "co-names" }, ids.map((id) => el("option", { value: companyName(id) })))));
  }
  const override = db.overrides.find((o) => o.company_id === editing.id);
  // The site's entry with any saved change that is not live yet on top.
  const base = editing.isNew ? { name: editing.request?.name ?? "", types: [] } : { ...(live.companies.find((c) => c.id === editing.id) ?? { id: editing.id }), ...(override?.data ?? {}) };
  const typeBox = (t) => el("label", { class: "check" }, el("input", { type: "checkbox", name: "types", value: t, checked: (base.types ?? []).includes(t) || null }), ` ${t}`);
  const listField = ([f, label, hint]) => el("label", { style: "display:grid;gap:2px" }, label, el("span", { class: "hint" }, hint), el("textarea", { name: f, rows: 3 }, (base[f] ?? []).join("\n")));
  const form = el("form", { class: "imp-form", id: "co-form", onsubmit: (e) => (e.preventDefault(), save(e.target)) },
    el("strong", {}, editing.isNew ? `New company${editing.request ? ` (requested by ${editing.request.requested_email ?? "a reader"})` : ""}` : `Edit ${base.name}`),
    editing.request?.note ? el("p", { class: "hint" }, `Request note: ${editing.request.note}${editing.request.website ? ` · ${editing.request.website}` : ""}`) : null,
    el("div", { class: "row" },
      el("label", {}, "Name ", el("input", { type: "text", name: "name", required: true, maxlength: 120, value: base.name ?? "" })),
      el("label", {}, "Legal name ", el("input", { type: "text", name: "legal", maxlength: 160, value: base.legal ?? "" }))),
    el("div", { class: "row" },
      el("label", {}, "Country code ", el("input", { type: "text", name: "country", required: true, pattern: "[A-Za-z]{2}", maxlength: 2, size: 3, value: base.country ?? "", title: "Two letters, e.g. US, DE, IN" })),
      el("label", {}, "Region ", el("select", { name: "region", required: true }, el("option", { value: "" }, "Choose…"), live.regions.map((r) => el("option", { value: r, selected: base.region === r || null }, r))))),
    el("div", {}, el("strong", {}, "Type"), el("div", { class: "r-boxes" }, live.types.map(typeBox))),
    ...FIELDS_LIST.map(listField),
    el("label", { style: "display:grid;gap:2px" }, "History", el("textarea", { name: "history", rows: 2, maxlength: 600 }, base.history ?? "")),
    el("label", {}, "Why this change (for the log) ", el("input", { type: "text", name: "note", maxlength: 1000, value: override?.note ?? "" })),
    el("div", { class: "row" },
      el("button", { type: "submit", class: "primary" }, editing.isNew ? "Add company" : "Save changes"),
      el("button", { type: "button", onclick: () => ((editing = null), render()) }, "Cancel")),
    msg("co-msg"),
  );
  return form;
}

async function save(form) {
  const v = (n) => form.elements[n].value.trim();
  const fields = {
    name: v("name"),
    legal: v("legal") || undefined,
    country: v("country").toUpperCase(),
    region: v("region"),
    types: [...form.querySelectorAll("input[name=types]:checked")].map((x) => x.value),
    ...Object.fromEntries(FIELDS_LIST.map(([f]) => [f, lines(form.elements[f].value)])),
    history: v("history") || undefined,
  };
  const out = $("co-msg");
  if (!fields.types.length) return void (out.textContent = "Choose at least one type.");
  let id = editing.id;
  let data;
  if (editing.isNew) {
    id = slug(fields.name);
    if (!id) return void (out.textContent = "The name needs at least one letter or number.");
    if (live.companies.some((c) => c.id === id) || live.hidden.some((c) => c.id === id)) return void (out.textContent = `A company with the id "${id}" is already listed. Edit that one instead.`);
    data = Object.fromEntries(Object.entries(fields).filter(([, x]) => x !== undefined && !(Array.isArray(x) && !x.length)));
  } else {
    // Only what differs from the site's current entry is added to this company's change.
    const current = live.companies.find((c) => c.id === id) ?? {};
    const prev = db.overrides.find((o) => o.company_id === id)?.data ?? {};
    const changed = Object.fromEntries(Object.entries(fields).filter(([f, x]) => !same(x ?? (Array.isArray(current[f]) ? [] : undefined), current[f])).map(([f, x]) => [f, x ?? ""]));
    data = { ...prev, ...changed };
    if (same(data, prev) && !Object.keys(changed).length) return void (out.textContent = "Nothing changed.");
  }
  const request = editing.request;
  await act(out, async () => {
    check(await sb.from("company_overrides").upsert({ company_id: id, data, hidden: false, note: form.elements.note.value.trim() || null }));
    if (request) check(await sb.from("company_requests").update({ status: "added", company_id: id }).eq("id", request.id));
    editing = null;
  }, `Saved ${fields.name}. It goes live at the next build.`);
}

function requestsBlock() {
  const open = db.requests.filter((r) => r.status === "open");
  const done = db.requests.length - open.length;
  if (!open.length) return el("p", { class: "hint" }, `No open company requests${done ? ` (${done} answered)` : ""}. Signed-in readers can ask for a company from the bottom of the Companies page.`);
  return el("div", {},
    el("h3", {}, `Requests (${open.length} open)`),
    el("div", { class: "st-table-wrap" }, el("table", { class: "st-table" },
      el("thead", {}, el("tr", {}, ["Company", "Details", "Asked by", ""].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, open.map((r) => el("tr", {},
        el("td", {}, el("b", {}, r.name)),
        el("td", {}, [r.country, r.website, r.note].filter(Boolean).join(" · ") || "—"),
        el("td", {}, r.requested_email ?? "—", " · ", time(r.created_at)),
        el("td", {}, el("div", { class: "row" },
          el("button", { type: "button", class: "primary", onclick: () => startEdit(null, r) }, "Add"),
          el("button", { type: "button", onclick: () => act($("req-msg"), async () => check(await sb.from("company_requests").update({ status: "declined" }).eq("id", r.id)), "Declined.") }, "Decline")))))))),
    msg("req-msg"));
}

function changesBlock() {
  if (!db.overrides.length) return el("p", { class: "hint" }, "No companies added, edited or hidden here yet. The site uses the repository list as it is.");
  const problems = new Map();
  for (const p of live.problems ?? []) problems.set(p.id, [...(problems.get(p.id) ?? []), p.problem]);
  const inRepo = (id) => live.companies.some((c) => c.id === id && !c.added) || live.hidden.some((c) => c.id === id);
  return el("div", {},
    el("h3", {}, "Your company changes"),
    el("div", { class: "st-table-wrap" }, el("table", { class: "st-table" },
      el("thead", {}, el("tr", {}, ["Company", "Change", "Saved", ""].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, db.overrides.map((o) => {
        const kind = o.hidden ? "Hidden" : inRepo(o.company_id) ? `Edited: ${Object.keys(o.data).join(", ") || "nothing"}` : "Added";
        const live_ = o.updated_at <= (live.built ?? "");
        const issues = problems.get(o.company_id);
        return el("tr", { class: issues ? "st-bad" : "" },
          el("td", {}, o.hidden ? companyName(o.company_id) : el("a", { href: `company.html?id=${encodeURIComponent(o.company_id)}` }, companyName(o.company_id))),
          el("td", {}, kind, o.note ? el("div", { class: "hint" }, o.note) : null, issues ? el("div", {}, `⚠ Not fully applied: ${issues.join("; ")}`) : null),
          el("td", {}, time(o.updated_at), live_ ? " · live" : " · not live yet"),
          el("td", {}, el("div", { class: "row" },
            o.hidden ? null : el("button", { type: "button", onclick: () => startEdit(o.company_id) }, "Edit"),
            el("button", { type: "button", onclick: () => act($("chg-msg"), async () => check(await sb.from("company_overrides").update({ hidden: !o.hidden }).eq("company_id", o.company_id))) }, o.hidden ? "Show again" : "Hide"),
            el("button", { type: "button", onclick: () => confirm(inRepo(o.company_id) ? "Undo this change? The repository entry comes back as it is." : "Remove this added company from the site?") && act($("chg-msg"), async () => check(await sb.from("company_overrides").delete().eq("company_id", o.company_id))) }, inRepo(o.company_id) ? "Undo" : "Remove"))));
      })))),
    msg("chg-msg"));
}

function hideForm() {
  return el("form", { class: "row", onsubmit: (e) => {
    e.preventDefault();
    const name = e.target.co.value.trim().toLowerCase();
    const c = live.companies.find((x) => x.name.toLowerCase() === name || x.id === name);
    if (!c) return void ($("hide-msg").textContent = "Pick a company from the list.");
    if (!confirm(`Hide ${c.name} from the site? Its page and matches go away at the next build. You can show it again any time.`)) return;
    const existing = db.overrides.find((o) => o.company_id === c.id);
    act($("hide-msg"), async () => check(await sb.from("company_overrides").upsert({ company_id: c.id, data: existing?.data ?? {}, hidden: true, note: existing?.note ?? null })));
  } },
    el("label", {}, "Hide a company ", el("input", { type: "text", name: "co", list: "co-names", placeholder: "Company name" })),
    el("button", { type: "submit" }, "Hide"),
    msg("hide-msg"));
}

function companiesSection() {
  return el("section", { class: "profile", id: "companies" },
    el("h2", {}, "Companies"),
    el("p", { class: "hint" }, "Add a company, change its names and matching phrases, or hide it. Changes are applied over the repository list at each build; undo one and the repository entry comes back. New companies are matched to updates and papers straight away, and get their FDA and EMA products at the weekly registry refresh (Mondays)."),
    requestsBlock(),
    changesBlock(),
    editor(),
    editing ? null : hideForm(),
  );
}

// ── Admins ──────────────────────────────────────────────────────────────────

function adminsSection() {
  const mine = me.email.toLowerCase();
  return el("section", { class: "profile", id: "admins" },
    el("h2", {}, "Admins"),
    el("p", { class: "hint" }, "Admins can use this page and the research review queue. They sign in with the email listed here. Until custom email (SMTP) is set up in Supabase, sign-in links reach only members of your Supabase organisation."),
    el("ul", { class: "members" }, db.admins.map((a) => el("li", {},
      el("span", {}, el("b", {}, a.email), a.email === mine ? " (you)" : "", el("span", { class: "hint" }, ` · added `, time(a.added_at), a.added_by ? ` by ${a.added_by}` : "")),
      a.email === mine ? null : el("button", { type: "button", class: "act", onclick: () => confirm(`Remove ${a.email} as an admin?`) && act($("adm-msg"), async () => check(await sb.rpc("admin_remove_admin", { old_email: a.email })), "Removed.") }, "Remove")))),
    el("form", { class: "row", onsubmit: (e) => (e.preventDefault(), act($("adm-msg"), async () => check(await sb.rpc("admin_add_admin", { new_email: e.target.email.value })), "Added. They can open this page after signing in.")) },
      el("input", { type: "email", name: "email", required: true, placeholder: "colleague@company.com", "aria-label": "New admin's email" }),
      el("button", { type: "submit" }, "Add admin")),
    msg("adm-msg"),
  );
}

// ── Data sources and research review ────────────────────────────────────────

function sourcesSection() {
  if (!status) return el("section", { class: "profile", id: "sources" }, el("h2", {}, "Data sources"), el("p", {}, "No data status has been published yet. "), el("p", {}, el("a", { class: "btn", href: "admin-sources.html" }, "Manage data sources")));
  const { level, problems } = dataHealth(status);
  const failing = [
    ...status.sources.filter((s) => !s.ok).map((s) => ({ group: s.kind === "official" ? "Regulator feed" : "News search", ...s })),
    ...(status.research?.sources ?? []).filter((s) => s.configured && !s.ok).map((s) => ({ group: "Research", ...s })),
    ...(status.companies?.sources ?? []).filter((s) => !s.ok).map((s) => ({ group: "Company registry", ...s })),
  ];
  return el("section", { class: "profile", id: "sources" },
    el("h2", {}, "Data sources"),
    el("p", {}, level === "ok" ? "✓ " : "⚠ ", `${status.feeds.ok} of ${status.feeds.total} update sources reachable at the last build. `, el("a", { href: "status.html" }, "Full source status")),
    problems.filter((p) => p.alert && !p.source).map((p) => el("p", { class: "r-alert" }, p.text)),
    failing.length
      ? el("div", { class: "st-table-wrap" }, el("table", { class: "st-table" },
          el("thead", {}, el("tr", {}, ["Source", "Problem", "Last success"].map((h) => el("th", { scope: "col" }, h)))),
          el("tbody", {}, failing.map((s) => el("tr", { class: "st-bad" }, el("td", {}, `${s.group}: ${s.name}`), el("td", {}, s.error ?? "failed", s.failingSince ? ` · since ${ago(new Date(s.failingSince))}` : ""), el("td", {}, time(s.lastSuccess)))))))
      : el("p", { class: "hint" }, "No source failed at the last build."),
    el("p", {}, el("a", { class: "btn", href: "admin-sources.html" }, "Manage data sources")),
    el("p", { class: "hint" }, "Add, test, edit, pause or resume a source, see each one's health and history, and undo any change. A source that keeps failing stays active and opens a GitHub issue after 6 failed runs in a row."),
  );
}

// The public directory of safety data resources: counts from the last build; the work is on its own page.
function resourcesSection() {
  return el("section", { class: "profile", id: "resources" },
    el("h2", {}, "Safety data resources"),
    el("p", {}, resourcesPub ? `${resourcesPub.total} resources are published in the public directory. ` : "The public directory has not been built yet. ", el("a", { href: "resources.html" }, "Open the directory")),
    el("p", {}, el("a", { class: "btn", href: "admin-resources.html" }, "Manage safety data resources")),
    el("p", { class: "hint" }, "Add, edit, verify, categorize, flag broken links and retire resources, and answer readers' suggestions and corrections. A resource is a reference link for readers; it never makes PV Info collect anything (that is Data sources)."),
  );
}

function researchSection() {
  const papers = research?.papers ?? [];
  return el("section", { class: "profile", id: "research" },
    el("h2", {}, "Research review"),
    papers.length
      ? el("p", {}, `${papers.length} papers on the site, as of the last build: `, REVIEW_QUEUES.filter((q) => q.id !== "status").map((q, i) => [i ? " · " : "", `${q.label} ${papers.filter(q.test).length}`]))
      : el("p", { class: "hint" }, "No research has been published yet."),
    el("p", {}, el("a", { class: "btn", href: "research-admin.html" }, "Open the research review queue")),
  );
}

function activitySection() {
  return el("section", { class: "profile", id: "activity" },
    el("h2", {}, "Activity"),
    db.events.length
      ? el("ul", { class: "log" }, db.events.map((e) => el("li", {}, time(e.at), " ", el("b", {}, e.action), e.target ? ` ${e.target}` : "", el("span", { class: "hint" }, ` · ${e.by_email ?? "system"}`))))
      : el("p", { class: "hint" }, "Nothing yet. Every admin change is listed here."),
  );
}

// ── Site menu and status strip ──────────────────────────────────────────────

const setting = (k, fallback) => db.settings.find((x) => x.key === k)?.value ?? fallback;

function savedMenu() {
  const order = setting("nav_order", site?.navOrder ?? Object.keys(NAV_LABELS)).filter((x) => x in NAV_LABELS);
  return { order: [...order, ...Object.keys(NAV_LABELS).filter((x) => !order.includes(x))], hidden: new Set(setting("hidden_nav", site?.hiddenNav ?? [])) };
}

function menuSection() {
  menu ??= savedMenu();
  const move = (i, d) => {
    const j = i + d;
    [menu.order[i], menu.order[j]] = [menu.order[j], menu.order[i]];
    render();
    $("menu").querySelectorAll("li")[j]?.querySelector(`button[data-d="${d}"]`)?.focus();
  };
  const saved = savedMenu();
  const changed = saved.order.join() !== menu.order.join() || [...saved.hidden].sort().join() !== [...menu.hidden].sort().join();
  const strip = setting("status_strip", site?.statusStrip ?? "admins");
  return el("section", { class: "profile", id: "menu" },
    el("h2", {}, "Site menu"),
    el("p", { class: "hint" }, "Arrange the menu and hide pages from it, for every visitor. A hidden page still opens from a direct link. Updates always stays, and Sign in is always last."),
    el("ol", { class: "ad-menu" }, menu.order.map((id, i) => el("li", { class: menu.hidden.has(id) ? "off" : "" },
      el("label", { class: "check" }, el("input", { type: "checkbox", checked: !menu.hidden.has(id) || null, disabled: id === "index" || null, onchange: (e) => (e.target.checked ? menu.hidden.delete(id) : menu.hidden.add(id), render()) }), ` ${NAV_LABELS[id]}`, menu.hidden.has(id) ? el("span", { class: "hint" }, " (hidden)") : null),
      el("span", { class: "row" },
        el("button", { type: "button", "data-d": "-1", "aria-label": `Move ${NAV_LABELS[id]} up`, disabled: i === 0 || null, onclick: () => move(i, -1) }, "↑"),
        el("button", { type: "button", "data-d": "1", "aria-label": `Move ${NAV_LABELS[id]} down`, disabled: i === menu.order.length - 1 || null, onclick: () => move(i, 1) }, "↓"))))),
    el("div", { class: "row" },
      el("button", { type: "button", class: "primary", disabled: !changed || null, onclick: () => act($("menu-msg"), async () => {
        check(await sb.rpc("admin_set_setting", { k: "nav_order", v: menu.order }));
        check(await sb.rpc("admin_set_setting", { k: "hidden_nav", v: [...menu.hidden] }));
        menu = null;
      }) }, "Save menu"),
      changed ? el("button", { type: "button", onclick: () => ((menu = null), render()) }, "Discard changes") : null),
    msg("menu-msg"),
    el("h3", {}, "Data status line"),
    el("p", { class: "hint" }, "The line under the menu that says when updates were last refreshed and how many sources were reachable."),
    el("div", { class: "row" }, [["admins", "Show it to admins only"], ["everyone", "Show it to everyone"]].map(([v, label]) =>
      el("label", { class: "check" }, el("input", { type: "radio", name: "strip", value: v, checked: strip === v || null, onchange: () => act($("strip-msg"), async () => check(await sb.rpc("admin_set_setting", { k: "status_strip", v }))) }), ` ${label}`))),
    msg("strip-msg"),
  );
}

function render() {
  $("ad-msg").textContent = "";
  $("lede").textContent = `Signed in as ${me.email}. Changes here are saved in the database and go live at the next build.`;
  $("jump").hidden = false;
  $("app").replaceChildren(publishSection(), approvalSection(), companiesSection(), menuSection(), adminsSection(), sourcesSection(), resourcesSection(), researchSection(), activitySection());
}

async function main() {
  await cloud.navOnly();
  sb = await cloud.client();
  if (!sb) {
    $("lede").textContent = "The Admin page needs the database, and this site was built without it.";
    return;
  }
  me = await cloud.currentUser();
  if (!me) {
    $("lede").replaceChildren("Sign in as an admin to use this page. ", el("a", { href: "account.html" }, "Sign in"), ".");
    return;
  }
  const { data: isAdmin, error } = await sb.rpc("is_app_admin");
  if (error || !isAdmin) {
    $("lede").textContent = error
      ? `The admin features are not set up in the database yet (${error.message}). Run supabase/schema.sql again in the Supabase SQL Editor.`
      : `Signed in as ${me.email}, which is not an admin. Ask an existing admin to add you on this page.`;
    return;
  }
  [live, status, research, site, resourcesPub] = await Promise.all([getJson("data/companies/admin.json"), getJson("data/status.json"), getJson("data/research.json"), getJson("data/site.json"), getJson("data/resources.json")]);
  if (!live) {
    $("lede").textContent = "This site's last build did not publish the admin data (data/companies/admin.json). It appears after the next build.";
    return;
  }
  try {
    await load();
  } catch (e) {
    $("lede").textContent = `Admin data couldn't be loaded: ${e.message}. If this is the first time, run supabase/schema.sql again in the Supabase SQL Editor.`;
    return;
  }
  render();
}

main();
