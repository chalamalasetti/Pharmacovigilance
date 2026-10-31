// The Research & Innovation editor queue (research-admin.html). Signed-in admins
// (supabase/schema.sql: research_admins) correct topics, check summaries against the
// abstract, hide papers with weak PV relevance, fix version links and override
// maturity. Each save is one research_reviews row; the database stamps who and when
// and keeps the revision history. The public pages pick reviews up at the next build.

import * as R from "./research-lib.js";
import * as cloud from "./cloud.js";

const $ = (id) => document.getElementById(id);
const PAGE = 30;

let raw = null; // research.json as built, before any review is applied
let data = null;
let tab = "todo";
let shown = PAGE;
let q = "";
let reviews = new Map();
let sb = null;
let me = "";

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.flat().filter((k) => k != null && k !== false));
  return n;
};

const topicLabel = (id) => [...data.taxonomy.applications, ...data.taxonomy.methods].find((t) => t.id === id)?.label ?? id;

// Rebuilds the working copy with the live reviews, so a save shows at once.
function applyLive() {
  data = structuredClone(raw);
  for (const p of data.papers) {
    const r = reviews.get(p.id);
    if (r) p.review = R.reviewFromRow(r);
    else delete p.review;
  }
  R.applyReviews(data.papers);
}

async function loadReviews() {
  const { data: rows, error } = await sb.rpc("admin_research_reviews");
  if (error) throw error;
  reviews = new Map(rows.map((r) => [r.paper_id, r]));
  applyLive();
}

function editor(p, onDone) {
  const r = reviews.get(p.id) ?? {};
  const auto = p.autoTags ?? p.tags;
  const current = new Set([...p.tags.applications, ...p.tags.methods].map((t) => t.id));
  const autoIds = new Set([...auto.applications, ...auto.methods].map((t) => t.id));
  const box = (t) =>
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "tag", value: t.id, checked: current.has(t.id) || null }), ` ${t.label}`, autoIds.has(t.id) ? el("span", { class: "why" }, " (automatic)") : null);
  const radio = (name, value, label, on) => el("label", { class: "check" }, el("input", { type: "radio", name, value, checked: on || null }), ` ${label}`);
  const versionOpts = [
    el("option", { value: "" }, "Automatic linking"),
    el("option", { value: "none", selected: r.version_of === "none" || null }, "Not a version of another paper (remove links)"),
    ...data.papers
      .filter((x) => x.id !== p.id && (x.type === "preprint") !== (p.type === "preprint") && x.title?.toLowerCase().trim() === p.title?.toLowerCase().trim())
      .slice(0, 20)
      .map((x) => el("option", { value: x.id, selected: r.version_of === x.id || null }, `Same paper as: ${x.title.slice(0, 80)} (${R.typeLabel(x.type)}, ${x.published ?? "undated"})`)),
  ];
  const status = el("span", { class: "hint", "aria-live": "polite" });
  const form = el(
    "form",
    { class: "imp-form" },
    el("strong", {}, "PV application"),
    el("div", { class: "r-boxes" }, data.taxonomy.applications.map(box)),
    el("strong", {}, "Method or technology"),
    el("div", { class: "r-boxes" }, data.taxonomy.methods.map(box)),
    el("label", { class: "check" }, el("input", { type: "checkbox", name: "confirmTags", checked: Boolean(r.tags) || null }), " Mark these topics as checked, even if unchanged"),
    el("strong", {}, "Summary and sections"),
    el("div", { class: "row" },
      radio("summary", "", "Not checked", !r.summary_status),
      radio("summary", "approved", "Approve: they match the abstract", r.summary_status === "approved"),
      radio("summary", "rejected", "Reject: withdraw from public pages", r.summary_status === "rejected")),
    el("strong", {}, "PV relevance"),
    el("div", { class: "row" },
      radio("relevance", "", "Not checked", !r.relevance),
      radio("relevance", "ok", "Relevant to PV", r.relevance === "ok"),
      radio("relevance", "weak", "Weak: hide from the research list", r.relevance === "weak")),
    el("strong", {}, "Evidence maturity"),
    el("div", { class: "row" },
      el("select", { name: "maturity" },
        el("option", { value: "" }, `Automatic (${(p.autoMaturity ?? p.maturity).label})`),
        R.MATURITY_LEVELS.map((m) => el("option", { value: m.id, selected: r.maturity?.id === m.id || null }, m.label))),
      el("input", { type: "text", name: "maturityReason", placeholder: "Reason, shown on the paper page", value: r.maturity?.reason ?? "" })),
    el("strong", {}, "Versions"),
    el("select", { name: "versionOf" }, versionOpts),
    el("strong", {}, "Internal note"),
    el("textarea", { name: "note", rows: "2", placeholder: "Seen by admins only" }, r.note ?? ""),
    el("div", { class: "row" },
      el("button", { type: "submit", class: "primary" }, "Save review"),
      reviews.has(p.id) ? el("button", { type: "button", onclick: () => clear(p, status, onDone) }, "Clear review") : null,
      el("button", { type: "button", onclick: () => history(p, form) }, "History"),
      status),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const ids = fd.getAll("tag");
    const appIds = new Set(data.taxonomy.applications.map((t) => t.id));
    const row = R.reviewRow(p, {
      applications: ids.filter((id) => appIds.has(id)),
      methods: ids.filter((id) => !appIds.has(id)),
      confirmTags: fd.get("confirmTags") === "on",
      summary: fd.get("summary"),
      relevance: fd.get("relevance"),
      maturity: fd.get("maturity"),
      maturityReason: fd.get("maturityReason"),
      versionOf: fd.get("versionOf"),
      note: fd.get("note"),
    });
    status.textContent = "Saving…";
    // Plain upsert: the notes and reviewer columns can't be read back directly, so reload through the admin function.
    const { error } = await sb.from("research_reviews").upsert(row, { returning: "minimal" });
    if (error) return (status.textContent = `Not saved: ${error.message}`);
    await loadReviews();
    applyLive();
    status.textContent = "Saved. Public pages update at the next build.";
    onDone();
  });
  return form;
}

async function clear(p, status, onDone) {
  if (!confirm("Remove this review? The paper goes back to its automated tags and summary.")) return;
  const { error } = await sb.from("research_reviews").delete().eq("paper_id", p.id);
  if (error) return (status.textContent = `Not removed: ${error.message}`);
  reviews.delete(p.id);
  applyLive();
  onDone();
}

async function history(p, form) {
  const { data: rows, error } = await sb.from("research_review_events").select("action,before,after,by_email,at").eq("paper_id", p.id).order("at", { ascending: false }).limit(20);
  const list = el("ul", { class: "imp-list" });
  if (error) list.append(el("li", {}, `History unavailable: ${error.message}`));
  else if (!rows.length) list.append(el("li", {}, "No changes yet."));
  for (const h of rows ?? []) {
    const changed = h.after && h.before ? Object.keys(h.after).filter((k) => !["reviewed_at", "reviewed_by"].includes(k) && JSON.stringify(h.after[k]) !== JSON.stringify(h.before[k])) : [];
    list.append(el("li", {}, `${h.at.slice(0, 16).replace("T", " ")} · ${h.by_email ?? "unknown"} · ${h.action}${changed.length ? ` (${changed.join(", ")})` : ""}`));
  }
  form.querySelector(".r-history")?.remove();
  form.append(el("div", { class: "r-history" }, el("strong", {}, "Revision history"), list));
}

function row(p) {
  const box = el("div");
  const toggle = el("button", { type: "button", class: "imp-toggle", "aria-expanded": "false" }, "Review ▾");
  const draw = () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    box.replaceChildren(open ? editor(data.papers.find((x) => x.id === p.id), () => render()) : "");
  };
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close ▴" : "Review ▾";
    draw();
  });
  return el(
    "article",
    { class: `card r-card${p.excluded ? " dismissed" : ""}` },
    el("div", { class: "meta" },
      el("span", { class: `r-type t-${p.type}` }, R.typeLabel(p.type)),
      ...(p.status ?? []).map((s) => el("span", { class: `badge s-${s.type}` }, R.STATUS_LABEL[s.type])),
      el("span", { class: `r-mat m-${p.maturity.id}` }, p.maturity.label),
      p.review ? el("span", { class: "ws-badge" }, R.reviewLine(p)) : null,
      p.excluded ? el("span", { class: "ws-badge dim" }, "Hidden") : null),
    el("h3", {}, el("a", { href: `paper.html?id=${p.id}`, target: "_blank" }, p.title)),
    el("p", { class: "r-by" }, R.authorLine(p), p.venue ? ` · ${p.venue}` : "", p.published ? ` · ${p.published}` : ""),
    el("p", { class: "why" }, `PV relevance words: ${(p.relevance ?? []).join(", ")}. Topics: ${[...p.tags.applications, ...p.tags.methods].map((t) => topicLabel(t.id)).join(", ") || "none"}.`),
    p.summaryWithdrawn ? el("p", { class: "none" }, "Summary withdrawn.") : p.summary.length ? el("p", { class: "summary" }, p.summary.map((s) => s.text).join(" ")) : el("p", { class: "none" }, "No abstract."),
    (p.family ?? []).length ? el("p", { class: "why" }, `Linked versions: ${p.family.map((f) => `${f.relation} (${f.how})`).join("; ")}`) : null,
    toggle,
    box,
  );
}

function render() {
  const queue = R.REVIEW_QUEUES.find((t) => t.id === tab);
  const fold = (s) => s.toLowerCase();
  const list = data.papers.filter((p) => queue.test(p) && (!q || fold(`${p.title} ${p.ids?.doi ?? ""}`).includes(fold(q))));
  const failing = data.sources.filter((s) => s.configured && !s.ok);
  $("lede").textContent = `Signed in as ${me}. ${reviews.size} of ${raw.papers.length} papers reviewed.`;
  $("app").replaceChildren(
    ...[failing.length ? el("p", { class: "r-alert" }, `⚠ Failed at the last refresh: ${failing.map((s) => `${s.name} (${s.error})`).join("; ")}`) : null,
    el("div", { class: "r-tabs", role: "tablist" },
      R.REVIEW_QUEUES.map((t) => el("button", { type: "button", role: "tab", "aria-selected": String(t.id === tab), onclick: () => ((tab = t.id), (shown = PAGE), render()) }, `${t.label} `, el("span", { class: "n" }, `(${data.papers.filter(t.test).length})`)))),
    el("div", { class: "row" }, el("input", { type: "search", placeholder: "Find by title or DOI", value: q, oninput: (e) => ((q = e.target.value), render()) })),
    ...(list.length ? list.slice(0, shown).map(row) : [el("p", { class: "empty" }, "Nothing in this queue.")]),
    list.length > shown ? el("button", { type: "button", class: "more", onclick: () => ((shown += PAGE), render()) }, "Show more") : null,
  ].filter(Boolean));
  const input = $("app").querySelector("input[type=search]");
  if (q && document.activeElement !== input) {
    input.focus();
    input.setSelectionRange(q.length, q.length);
  }
}

async function main() {
  await cloud.navOnly();
  sb = await cloud.client();
  if (!sb) {
    $("lede").textContent = "The review queue needs the database, and this site was built without it.";
    return;
  }
  const user = await cloud.currentUser();
  if (!user) {
    $("lede").replaceChildren("Sign in to review research. ", el("a", { href: "account.html" }, "Sign in"), ".");
    return;
  }
  const { data: isAdmin, error } = await sb.rpc("is_research_admin");
  if (error || !isAdmin) {
    $("lede").replaceChildren(
      `Signed in as ${user.email}, which is not a research admin. `,
      error ? `(${error.message}) ` : "",
      "To add an admin, run this in Supabase → SQL Editor: ",
      el("code", {}, `insert into public.research_admins (email) values ('${user.email.toLowerCase()}') on conflict do nothing;`),
    );
    return;
  }
  const res = await fetch("data/research.json", { cache: "no-cache" });
  raw = await res.json();
  try {
    await loadReviews();
  } catch (e) {
    $("lede").textContent = `Reviews couldn't be loaded: ${e.message}`;
    return;
  }
  me = user.email;
  render();
}

main();
