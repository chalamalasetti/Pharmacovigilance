// Renders public/data/research.json as Latest research (filterable list), the
// Innovation timeline (dated events for one topic) and My watchlist (saved papers,
// followed topics and saved searches).
// Filters live in the URL so a view can be shared; the watchlist lives in this
// browser's localStorage (research-lib.js).

import { ago } from "./lib.js";
import * as R from "./research-lib.js";

const $ = (id) => document.getElementById(id);
const PAGE = 40;
const DEFAULTS = { q: "", app: "", method: "", type: "", maturity: "", days: "365", oa: "", since: "", event: "", order: "", view: "latest" };

let data = null;
let shown = PAGE;
const state = { ...DEFAULTS };
const watch = R.startVisit(R.loadWatch());
R.saveWatch(watch);
const persist = () => R.saveWatch(watch);

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

function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) state[k] = p.get(k) ?? DEFAULTS[k];
}

function writeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v && v !== DEFAULTS[k]) p.set(k, v);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

const topicLabel = (id) => [...data.taxonomy.applications, ...data.taxonomy.methods].find((t) => t.id === id)?.label ?? id;
const MATURITY = [
  ["concept", "Concept proposed"],
  ["experimental", "Experimentally evaluated"],
  ["external", "Externally evaluated"],
  ["operational", "Operational evidence reported"],
  ["na", "Not assessed (reviews, commentary)"],
  ["unclear", "Not enough information"],
];

function count(fn) {
  const m = new Map();
  for (const p of data.papers) for (const k of fn(p)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function renderFilters() {
  $("q").value = state.q;
  $("days").value = state.days;
  $("oa").checked = state.oa === "1";
  $("since").checked = state.since === "1";
  $("since-wrap").hidden = !watch.prevVisit;
  const opts = (sel, all, list, counts) =>
    sel.replaceChildren(el("option", { value: "" }, all), ...list.map(([id, label]) => el("option", { value: id, selected: state[sel.id] === id }, `${label}${counts ? ` (${counts.get(id) ?? 0})` : ""}`)));
  opts($("app"), "All PV applications", data.taxonomy.applications.map((t) => [t.id, t.label]), count((p) => p.tags.applications.map((t) => t.id)));
  opts($("method"), "All methods", data.taxonomy.methods.map((t) => [t.id, t.label]), count((p) => p.tags.methods.map((t) => t.id)));
  opts($("type"), "All types", R.TYPES.map((t) => [t.id, t.label]), count((p) => [p.type]));
  opts($("maturity"), "Any maturity", MATURITY, count((p) => [p.maturity?.id]));
}

const followBtn = (id) => {
  const on = watch.topics.includes(id);
  return el("button", { type: "button", class: "act", "aria-pressed": String(on), title: on ? "Stop following this topic" : "Follow this topic", onclick: () => (R.toggleTopic(watch, id), persist(), refresh()) }, `${on ? "★" : "☆"} ${topicLabel(id)}`);
};

function card(p) {
  const saved = Boolean(watch.saved[p.id]);
  const firstApp = p.tags.applications[0]?.id;
  const link = R.primaryLink(p);
  const retracted = p.status?.some((s) => s.type === "retracted");
  return el(
    "article",
    { class: `card r-card${retracted ? " r-retracted" : ""}` },
    el(
      "div",
      { class: "meta" },
      el("span", { class: `r-type t-${p.type}` }, R.typeLabel(p.type)),
      p.type === "preprint" ? el("span", { class: "badge warnb" }, "Not peer reviewed") : null,
      ...(p.status ?? []).map((s) => el("span", { class: `badge s-${s.type}` }, R.STATUS_LABEL[s.type])),
      p.openAccess ? el("span", { class: "badge" }, "Open access") : null,
      R.isNew(watch, p) ? el("span", { class: "ws-badge" }, "New") : null,
      p.maturity && p.maturity.id !== "na" ? el("span", { class: `r-mat m-${p.maturity.id}`, title: p.maturity.reason }, p.maturity.label) : null,
      p.review ? el("span", { class: "ws-badge", title: R.reviewLine(p) }, "Reviewed") : null,
    ),
    el("h3", {}, el("a", { href: `paper.html?id=${p.id}` }, p.title)),
    el("p", { class: "r-by" }, R.authorLine(p), p.venue ? ` · ${p.venue}` : "", p.published ? ` · ${p.published}` : ""),
    p.summaryWithdrawn
      ? el("p", { class: "summary none" }, "Summary withdrawn after editorial review. Read the original publication.")
      : p.summary.length
        ? el("p", { class: "summary" }, el("span", { class: "r-q" }, "From the abstract: "), p.summary.map((s) => s.text).join(" "))
        : el("p", { class: "summary none" }, "No abstract available in the source record."),
    el(
      "div",
      { class: "imp-chips" },
      p.tags.applications.map((t) => el("button", { type: "button", class: "chip-s place", title: `Matched: ${t.why.join(", ")}`, onclick: () => set({ app: t.id }) }, topicLabel(t.id))),
      p.tags.methods.map((t) => el("button", { type: "button", class: "chip-s", title: `Matched: ${t.why.join(", ")}`, onclick: () => set({ method: t.id }) }, topicLabel(t.id))),
    ),
    el(
      "div",
      { class: "imp-actions" },
      el("button", { type: "button", class: "act", "aria-pressed": String(saved), onclick: () => (R.toggleSaved(watch, p), persist(), refresh()) }, saved ? "★ Saved" : "☆ Save"),
      firstApp ? followBtn(firstApp) : null,
      el("a", { class: "act", href: `paper.html?id=${p.id}` }, "Details"),
      link ? el("a", { class: "act", href: link, target: "_blank", rel: "noopener" }, p.ids?.doi ? "DOI ↗" : "Original ↗") : null,
    ),
  );
}

function filtered(extra = {}) {
  const f = { ...state, oa: state.oa === "1", since: state.since === "1" ? watch.prevVisit : null, ...extra };
  return data.papers.filter((p) => R.matchesPaper(p, f));
}

function emptyNote() {
  const failing = data.sources.filter((s) => s.configured && !s.ok);
  return el(
    "p",
    { class: "empty" },
    "No papers in the collection match these filters. ",
    failing.length ? `${failing.map((s) => s.name).join(", ")} could not be reached at the last refresh, so research may exist that isn't shown. ` : "This covers only the sources and searches PV Info collects, not all research. ",
    el("button", { type: "button", class: "link", onclick: () => set({ ...DEFAULTS, view: state.view }) }, "Clear the filters"),
    ".",
  );
}

function renderList() {
  const list = filtered();
  const scope = [state.app && topicLabel(state.app), state.method && topicLabel(state.method)].filter(Boolean).join(" · ");
  $("count").textContent = `${list.length} paper${list.length === 1 ? "" : "s"}${scope ? ` · ${scope}` : ""}`;
  $("list").replaceChildren(...(list.length ? list.slice(0, shown).map(card) : [emptyNote()]));
  $("more").hidden = list.length <= shown;
}

function renderWatch() {
  const saved = Object.values(watch.saved).sort((a, b) => b.at.localeCompare(a.at));
  const byId = new Map(data.papers.map((p) => [p.id, p]));
  const followedNew = data.papers.filter((p) => R.followedMatch(watch, p) && R.isNew(watch, p));
  const savedPapers = saved.map((s) => byId.get(s.paper.id) ?? { ...s.paper, summary: [], tags: { applications: [], methods: [] }, gone: true });

  const searchRow = (s, i) =>
    el("li", {}, el("a", { href: `?${s.params}` }, s.name), " ", el("button", { type: "button", class: "link", onclick: () => (watch.searches.splice(i, 1), persist(), refresh()) }, "remove"));

  $("watch").replaceChildren(
    el(
      "div",
      { class: "profile" },
      el("h2", {}, "Followed topics"),
      el("p", { class: "hint" }, "Follow topics to see their new papers here. Everything on this page is kept in this browser only."),
      el("div", { class: "imp-chips" }, ...data.taxonomy.applications.map((t) => followBtn(t.id))),
      el("div", { class: "imp-chips" }, ...data.taxonomy.methods.map((t) => followBtn(t.id))),
      el("h2", {}, "Saved searches"),
      watch.searches.length ? el("ul", { class: "imp-list" }, watch.searches.map(searchRow)) : el("p", { class: "hint" }, "Set filters on Latest research and choose Save this search."),
      el("div", { class: "row" },
        el("button", { type: "button", class: "act", disabled: !saved.length, onclick: () => download("pv-research-saved.ris", R.ris(savedPapers), "application/x-research-info-systems") }, "Export saved papers (RIS)"),
        el("span", { class: "hint" }, "Imports into EndNote, Zotero and Mendeley."),
      ),
    ),
    el("h2", {}, `New in followed topics since your last visit (${followedNew.length})`),
    ...(followedNew.length ? followedNew.slice(0, 20).map(card) : [el("p", { class: "empty" }, watch.topics.length ? "Nothing new since your last visit." : "Follow a topic above to see new papers here.")]),
    el("h2", {}, `Saved papers (${saved.length})`),
    ...(savedPapers.length
      ? savedPapers.map((p) => (p.gone ? el("article", { class: "card" }, el("h3", {}, el("a", { href: R.primaryLink(p) ?? "#", target: "_blank", rel: "noopener" }, p.title)), el("p", { class: "hint" }, "No longer in the collection; kept from when you saved it.")) : card(p)))
      : [el("p", { class: "empty" }, "Save papers with ☆ Save.")]),
  );
}

function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  el("a", { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHealth() {
  const bad = data.sources.filter((s) => s.configured && !s.ok);
  $("health").hidden = false;
  $("health-sum").textContent = bad.length ? `⚠ ${bad.length} source${bad.length > 1 ? "s" : ""} failed at the last refresh` : `Sources: ${data.sources.filter((s) => s.ok).length} of ${data.sources.filter((s) => s.configured).length} reachable`;
  $("health-list").replaceChildren(
    ...data.sources.map((s) =>
      el(
        "li",
        {},
        el("strong", {}, s.name), ": ",
        !s.configured ? s.note : s.ok ? `${s.count} records at the last refresh` : `failed (${s.error ?? "unknown error"})`,
        s.lastSuccess ? `. Last successful refresh ${ago(new Date(s.lastSuccess))}.` : s.configured ? ". No successful refresh yet." : "",
      ),
    ),
  );
}

function refresh() {
  const view = state.view;
  for (const v of ["latest", "timeline", "watch"]) $(`tab-${v}`).setAttribute("aria-selected", String(view === v));
  $("watch-n").textContent = Object.keys(watch.saved).length ? `(${Object.keys(watch.saved).length})` : "";
  $("watch").hidden = view !== "watch";
  $("timeline").hidden = view !== "timeline";
  document.body.classList.toggle("r-watching", view === "watch");
  document.body.classList.toggle("r-timing", view === "timeline");
  if (view === "watch") renderWatch();
  else if (view === "timeline") renderTimeline();
  else {
    renderList();
    const saveBtn = el("button", { type: "button", class: "link", onclick: saveSearch }, "Save this search");
    $("updated").replaceChildren(`Refreshed ${ago(new Date(data.refreshed))} · `, saveBtn);
  }
}

// ---- Innovation timeline ----

function topicPicker() {
  const counts = count((p) => [...p.tags.applications, ...p.tags.methods].map((t) => t.id));
  const chip = (t, place) => el("button", { type: "button", class: `chip-s${place ? " place" : ""}`, onclick: () => set({ [place ? "app" : "method"]: t.id }) }, `${t.label} (${counts.get(t.id) ?? 0})`);
  return el(
    "div",
    { class: "profile" },
    el("h2", {}, "Pick a topic to see how it has developed"),
    el("p", { class: "hint" }, "Choose a PV application, a method, or both (for example Literature screening with Large language models)."),
    el("span", { class: "label" }, "PV application"),
    el("div", { class: "imp-chips" }, data.taxonomy.applications.map((t) => chip(t, true))),
    el("span", { class: "label" }, "Method or technology"),
    el("div", { class: "imp-chips" }, data.taxonomy.methods.map((t) => chip(t, false))),
  );
}

function tlEntry(ev, byId) {
  const when = el("time", { class: "tl-date", datetime: ev.date }, ev.date);
  const badge = el("span", { class: `tl-kind k-${ev.type}` }, R.eventLabel(ev.type));
  if (ev.kind === "guidance") {
    const g = ev.guidance;
    return el("li", { class: `tl-item k-${ev.type}` }, el("span", { class: "tl-dot", "aria-hidden": "true" }), when, badge,
      el("h3", {}, el("a", { href: g.link, target: "_blank", rel: "noopener" }, g.title)),
      el("p", { class: "r-by" }, g.source),
      el("p", { class: "hint" }, "Official regulator update on this topic, from the PV Info updates feed."),
    );
  }
  const p = ev.paper;
  const c = R.contribution(p);
  const { earlier, later } = R.relatedByDate(p, byId);
  const family = (p.family ?? []).map((f) => ({ f, q: byId.get(f.id) })).filter((x) => x.q);
  const relLink = (q) => el("a", { href: `paper.html?id=${q.id}` }, q.title);
  return el(
    "li",
    { class: `tl-item k-${ev.type}${p.status?.some((s) => s.type === "retracted") ? " r-retracted" : ""}` },
    el("span", { class: "tl-dot", "aria-hidden": "true" }),
    when,
    badge,
    p.type === "preprint" ? el("span", { class: "badge warnb" }, "Not peer reviewed") : null,
    ...(p.status ?? []).map((s) => el("span", { class: `badge s-${s.type}` }, R.STATUS_LABEL[s.type])),
    p.maturity && p.maturity.id !== "na" ? el("span", { class: `r-mat m-${p.maturity.id}`, title: p.maturity.reason }, p.maturity.label) : null,
    el("h3", {}, el("a", { href: `paper.html?id=${p.id}` }, p.title)),
    el("p", { class: "r-by" }, R.authorLine(p, 2), p.venue ? ` · ${p.venue}` : ""),
    c ? el("p", { class: "tl-contrib" }, el("span", { class: "r-q" }, "Key contribution, from the abstract: "), c.text) : null,
    family.length ? el("p", { class: "tl-rel" }, ...family.flatMap(({ f, q }, i) => [i ? "; " : "", f.relation === "preprint" ? "Earlier preprint: " : f.relation === "published as" ? "Later published as: " : "Other version: ", relLink(q)])) : null,
    earlier.length || later.length
      ? el("p", { class: "tl-rel why" }, "Similar topic (shared vocabulary, not citations): ",
          ...earlier.slice(0, 2).flatMap((q, i) => [i ? ", " : "", "earlier ", relLink(q)]),
          earlier.length && later.length ? "; " : "",
          ...later.slice(0, 2).flatMap((q, i) => [i ? ", " : "", "later ", relLink(q)]))
      : null,
    R.primaryLink(p) ? el("a", { class: "link", href: R.primaryLink(p), target: "_blank", rel: "noopener" }, "Original source ↗") : null,
  );
}

function renderTimeline() {
  const box = $("timeline");
  const scope = [state.app && topicLabel(state.app), state.method && topicLabel(state.method)].filter(Boolean).join(" with ");
  if (!scope) {
    $("count").textContent = "Innovation timeline";
    box.replaceChildren(topicPicker());
    return;
  }
  const f = { ...state, oa: state.oa === "1", since: state.since === "1" ? watch.prevVisit : null };
  const events = R.timelineEvents(data.papers, data.guidance, f, { newest: state.order === "new" });
  const byId = new Map(data.papers.map((p) => [p.id, p]));
  $("count").textContent = `${scope}: ${events.length} event${events.length === 1 ? "" : "s"}`;
  const range = events.length ? `${events.reduce((a, e) => (e.date < a ? e.date : a), events[0].date)} to ${events.reduce((a, e) => (e.date > a ? e.date : a), events[0].date)}` : "";
  const typeChips = el("div", { class: "chips", role: "group", "aria-label": "Event type" },
    ["", ...R.EVENT_TYPES.map((t) => t.id)].map((id) => el("button", { type: "button", class: `chip${id ? ` tl-chip k-${id}` : ""}`, "aria-pressed": String(state.event === id), onclick: () => set({ event: id }) }, id ? R.eventLabel(id) : "All events")));
  const groups = [];
  let month = null;
  let side = 0;
  for (const ev of events) {
    const m = ev.date.slice(0, 7);
    if (m !== month) groups.push(el("li", { class: "tl-month" }, new Date(`${(month = m)}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })));
    const item = tlEntry(ev, byId);
    item.classList.add(side++ % 2 ? "tl-r" : "tl-l");
    groups.push(item);
  }
  box.replaceChildren(
    el("div", { class: "tl-head" },
      typeChips,
      el("div", { class: "row" },
        el("div", { class: "seg", role: "group", "aria-label": "Order" },
          el("button", { type: "button", "aria-pressed": String(state.order !== "new"), onclick: () => set({ order: "" }) }, "Oldest first"),
          el("button", { type: "button", "aria-pressed": String(state.order === "new"), onclick: () => set({ order: "new" }) }, "Newest first")),
        el("label", { class: "check tl-wide-toggle" }, el("input", { type: "checkbox", checked: watch.timelineWide || null, onchange: (e) => ((watch.timelineWide = e.target.checked), persist(), refresh()) }), " Expanded view"),
        el("button", { type: "button", class: "link", onclick: () => set({ app: "", method: "" }) }, "Change topic"),
      ),
      el("p", { class: "hint" }, `${range ? `${range}. ` : ""}Each entry is a dated source in the collection. Later work is not necessarily better, and entries are linked only where a version link or shared vocabulary supports it, never as "builds on".`),
    ),
    events.length ? el("ol", { class: `tl${watch.timelineWide ? " tl-wide" : ""}` }, groups) : emptyNote(),
  );
}

function saveSearch() {
  const params = location.search.slice(1);
  if (!params) return alert("Set some filters first.");
  const name = prompt("Name this search", [state.app && topicLabel(state.app), state.method && topicLabel(state.method), state.q].filter(Boolean).join(" · ") || "My search");
  if (!name) return;
  watch.searches.push({ name, params, at: new Date().toISOString() });
  persist();
}

function set(patch) {
  Object.assign(state, patch);
  shown = PAGE;
  writeUrl();
  renderFilters();
  refresh();
  if (patch.view) window.scrollTo(0, 0);
}

function wire() {
  let t;
  $("q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => set({ q: e.target.value.trim() }), 150);
  });
  // Filters apply to the list and the timeline; from the watchlist they open the list.
  const listView = () => (state.view === "watch" ? "latest" : state.view);
  for (const id of ["app", "method", "type", "maturity", "days"]) $(id).addEventListener("change", (e) => set({ [id]: e.target.value, view: listView() }));
  $("oa").addEventListener("change", (e) => set({ oa: e.target.checked ? "1" : "" }));
  $("since").addEventListener("change", (e) => set({ since: e.target.checked ? "1" : "" }));
  $("reset").addEventListener("click", () => set({ ...DEFAULTS, view: state.view }));
  $("more").addEventListener("click", () => {
    shown += PAGE;
    renderList();
  });
  $("tab-latest").addEventListener("click", () => set({ view: "latest" }));
  $("tab-watch").addEventListener("click", () => set({ view: "watch" }));
  $("tab-timeline").addEventListener("click", () => set({ view: "timeline" }));
  $("show-filters").addEventListener("click", () => {
    const open = document.body.classList.toggle("filters-open");
    $("show-filters").setAttribute("aria-expanded", String(open));
  });
}

async function main() {
  readUrl();
  wire();
  try {
    const res = await fetch("data/research.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
    R.applyReviews(data.papers);
  } catch {
    $("count").textContent = "No research collected yet";
    $("list").replaceChildren(el("p", { class: "empty" }, "The research collection hasn't been built. Run ", el("code", {}, "npm run research"), " and reload."));
    return;
  }
  renderFilters();
  renderHealth();
  refresh();
}

main();
