// One company's public page: Overview, Related updates, Products & markets, Research,
// and Sources & coverage, from data/companies/<id>.json. The tab and filters live in
// the URL so a view can be shared. Public data only: nothing here reads a team or sign-in.

import { flag, ago } from "./lib.js";
import * as C from "./companies-lib.js";

const $ = (id) => document.getElementById(id);
const TABS = ["overview", "updates", "products", "research", "sources"];
const DEFAULTS = { id: "", tab: "overview", scope: "relevant", corp: "", market: "", days: "", topic: "", official: "", pq: "", pmarket: "", pstatus: "" };
const PAGE = 50;
const CATEGORIES = { safety: "Safety alerts & signals", recall: "Recalls & quality", label: "Label changes", guideline: "Guidelines & guidance", regulation: "Regulatory changes", policy: "Policy & strategy", inspection: "Inspections & enforcement", approval: "Approvals & authorisations", news: "Industry & science news" };
const MARKETS = { US: "United States", EU: "European Union" };

let data = null;
let shown = PAGE;
const state = { ...DEFAULTS };

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
const ext = (href, text) => el("a", { href, target: "_blank", rel: "noopener" }, text);
const time = (iso) => (iso ? el("time", { datetime: iso, title: new Date(iso).toLocaleString() }, ago(new Date(iso))) : "unknown");
const day = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) state[k] = p.get(k) ?? DEFAULTS[k];
  if (!TABS.includes(state.tab)) state.tab = "overview";
}
function writeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v && (v !== DEFAULTS[k] || k === "id")) p.set(k, v);
  history.replaceState(null, "", `?${p}`);
}
function set(patch) {
  Object.assign(state, patch);
  shown = PAGE;
  writeUrl();
  render();
}

// "Only direct matches", the default (direct with substance and class), and corporate news on request.
function lanes() {
  const base = state.scope === "direct" ? ["direct"] : ["direct", "substance", "class"];
  return state.corp === "1" ? [...base, "corporate"] : base;
}

function header() {
  const p = data.profile;
  const following = C.loadFollowed().includes(p.id);
  const btn = el("button", { type: "button", class: "act", "aria-pressed": String(following) }, following ? "★ Following" : "☆ Follow");
  btn.addEventListener("click", () => {
    const on = C.toggleFollowed(p.id);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "★ Following" : "☆ Follow";
  });
  $("head").replaceChildren(
    el("div", { class: "co-title" }, el("h1", {}, p.name), btn),
    el("p", { class: "intro" }, `${flag(p.country)} ${p.legal ?? p.name} · ${p.region} · ${(p.types ?? []).map((t) => C.TYPE_LABELS[t] ?? t).join(", ")}`),
    el("p", { class: "co-meta" }, el("span", { class: `co-cov cov-${data.coverage.status}` }, C.COVERAGE[data.coverage.status]), " ", el("span", { class: "co-pub" }, "Public information")),
    data.manifest.status !== "approved" ? el("p", { class: "co-draft" }, "From the draft coverage list, not yet approved. Names and holder mappings may change after review.") : null,
  );
  document.title = `${p.name} · PV Info`;
}

function tabs() {
  $("tabs").hidden = false;
  const visible = (list) => C.filterRelated(list, { lanes: ["direct", "substance", "class"] }).length;
  $("n-updates").textContent = `(${visible(data.updates)})`;
  $("n-products").textContent = `(${data.products.length})`;
  $("n-research").textContent = `(${visible(data.research)})`;
  for (const t of TABS) {
    const b = $(`tab-${t}`);
    b.setAttribute("aria-selected", String(state.tab === t));
    b.tabIndex = state.tab === t ? 0 : -1;
  }
}

// ---- Overview ----

function overview() {
  const p = data.profile;
  const counts = (list) => list.reduce((m, x) => ((m[x.lane] = (m[x.lane] ?? 0) + 1), m), {});
  const u = counts(data.updates);
  const names = [
    p.aliases.length ? el("li", {}, el("strong", {}, "Also known as: "), p.aliases.join(", ")) : null,
    p.former.length ? el("li", {}, el("strong", {}, "Former names: "), p.former.join(", ")) : null,
    p.parent ? el("li", {}, el("strong", {}, "Group: "), `${p.parent.relation} (`, el("a", { href: `company.html?id=${p.parent.id}` }, p.parent.name ?? p.parent.id), ")") : null,
    p.history ? el("li", {}, el("strong", {}, "History: "), p.history) : null,
    ...(p.distinctFrom ?? []).map((d) => el("li", { class: "warn" }, "Not the same company as ", el("a", { href: `company.html?id=${d.id}` }, d.name), ". Their products and updates are kept apart.")),
    p.verify ? el("li", {}, el("strong", {}, "To verify: "), p.verify) : null,
  ];
  return [
    el(
      "div",
      { class: "tiles" },
      ...[
        [u.direct ?? 0, "direct matches"],
        [u.substance ?? 0, "substance matches"],
        [u.class ?? 0, "class matches"],
        [data.products.length, "sourced products"],
        [data.coverage.markets.length ? data.coverage.markets.join(", ") : "none", "markets mapped"],
      ].map(([n, l]) => el("div", { class: "tile" }, el("b", {}, String(n)), el("span", {}, l))),
    ),
    el("p", { class: "hint" }, "Counts are related public items, not safety findings. Never compare companies by these numbers: a large portfolio and wide media coverage produce more matches."),
    el("h2", {}, "Profile"),
    el("ul", { class: "co-facts" }, el("li", {}, el("strong", {}, "Legal name: "), p.legal ?? p.name), el("li", {}, el("strong", {}, "Home country: "), `${flag(p.country)} ${p.country}`), ...names),
    p.entities.length ? [el("h3", {}, "Units and subsidiaries listed"), el("ul", {}, p.entities.map((e) => el("li", {}, e.id ? el("a", { href: `company.html?id=${e.id}` }, e.name) : e.name, ` (${e.relation})`)))] : null,
    el("h2", {}, "Coverage"),
    el("p", {}, data.coverage.note),
    data.coverage.staleSources ? el("p", { class: "warn" }, "A registry source is failing; products from its last good copy are shown.") : null,
    el("p", { class: "hint" }, `Data built ${ago(new Date(data.built))}. See `, el("button", { type: "button", class: "link", onclick: () => set({ tab: "sources" }) }, "Sources & coverage"), " for where each relationship comes from."),
  ];
}

// ---- Related updates and research ----

function laneBadge(x) {
  return el("span", { class: `co-lane lane-${x.lane}`, title: C.LANES.find((l) => l.id === x.lane)?.text }, C.laneLabel(x.lane));
}

function relatedCard(x) {
  const paper = x.kind === "paper";
  return el(
    "article",
    { class: `card c-${x.category ?? "news"}` },
    el(
      "div",
      { class: "meta" },
      laneBadge(x),
      el("span", { class: "co-label" }, x.label),
      paper ? el("span", { class: "tag" }, x.peerReview === "preprint" ? "Preprint" : "Research") : el("span", { class: "tag" }, CATEGORIES[x.category] ?? x.category),
      x.country ? el("span", { class: "where" }, `${flag(x.country)} ${x.country}`) : null,
      x.official ? el("span", { class: "badge" }, "Official") : null,
    ),
    el("h3", {}, paper ? el("a", { href: `paper.html?id=${encodeURIComponent(x.paper)}` }, x.title) : ext(x.link, x.title)),
    el("p", { class: "why" }, "Why it's here: ", x.reason),
    x.outside ? el("p", { class: "why co-outside" }, "Outside selected markets: ", x.outside) : null,
    x.shared > 1 ? el("p", { class: "why" }, `Also related to ${x.shared - 1} other compan${x.shared > 2 ? "ies" : "y"}.`) : null,
    el("div", { class: "src" }, el("span", {}, paper ? x.venue ?? "" : x.source), el("span", {}, day(x.published))),
  );
}

function filters(kind) {
  const radio = (value, label) =>
    el("label", { class: "check" }, el("input", { type: "radio", name: "scope", value, checked: state.scope === value, onchange: () => set({ scope: value }) }), ` ${label}`);
  const topics = [...new Set(data.updates.map((x) => x.category).filter(Boolean))];
  const sel = (id, label, opts, value, key) =>
    el("div", { class: "field" }, el("label", { for: id }, label), el("select", { id, onchange: (e) => set({ [key]: e.target.value }) }, opts.map(([v, t]) => el("option", { value: v, selected: value === v }, t))));
  return el(
    "div",
    { class: "co-filters" },
    el("fieldset", { class: "co-scope" }, el("legend", { class: "label" }, "Show"), radio("direct", "Only direct matches"), radio("relevant", "Include substance and class relevance"), el("label", { class: "check" }, el("input", { type: "checkbox", checked: state.corp === "1", onchange: (e) => set({ corp: e.target.checked ? "1" : "" }) }), " Include company news (no product link)")),
    kind === "updates" ? sel("market", "Market", [["", "All markets"], ["US", "United States"], ["EU", "European Union"], ["outside", "Outside mapped markets"]], state.market, "market") : null,
    kind === "updates" ? sel("topic", "Topic", [["", "All topics"], ...topics.map((t) => [t, CATEGORIES[t] ?? t])], state.topic, "topic") : null,
    sel("days", "Published within", [["", "Any time"], ["30", "Last 30 days"], ["90", "Last 3 months"], ["365", "Last 12 months"]], state.days, "days"),
    kind === "updates" ? el("label", { class: "check" }, el("input", { type: "checkbox", checked: state.official === "1", onchange: (e) => set({ official: e.target.checked ? "1" : "" }) }), " Official regulator notices only") : null,
  );
}

function related(kind) {
  const all = data[kind];
  const list = C.filterRelated(all, { lanes: lanes(), market: kind === "updates" ? state.market : "", days: state.days, topic: kind === "updates" ? state.topic : "", official: kind === "updates" ? state.official : "" });
  const empty = C.emptyReason({ all, shown: list, coverage: data.coverage, sources: data.sources });
  return [
    kind === "research" ? el("p", { class: "hint" }, "Papers that name a product, substance or class this company holds. Research mentioning a substance does not establish company fault or product causality, and does not create a required action.") : el("p", { class: "hint" }, "Related public updates, grouped by how they matched. They are not company-confirmed safety issues. A notice about a substance applies to the products and markets the notice itself names."),
    filters(kind),
    el("h2", {}, `${list.length} related ${kind === "research" ? "paper" : "update"}${list.length === 1 ? "" : "s"}`),
    ...list.slice(0, shown).map(relatedCard),
    list.length > shown ? el("button", { type: "button", class: "more", onclick: () => ((shown += PAGE), render()) }, "Show more") : null,
    empty ? el("p", { class: "empty" }, empty.text, " ", empty.kind === "filtered" ? el("button", { type: "button", class: "link", onclick: () => set({ scope: "relevant", corp: "1", market: "", days: "", topic: "", official: "" }) }, "Show everything") : null) : null,
    el("p", { class: "hint" }, "No results does not mean no safety concerns: sources, mapping and matching rules all have gaps (see Sources & coverage)."),
  ];
}

// ---- Products ----

function productsTab() {
  const q = C.norm(state.pq);
  const list = data.products.filter(
    (p) =>
      (!state.pmarket || p.market === state.pmarket) &&
      (!state.pstatus || (state.pstatus === "current" ? !/discontinued|withdrawn|suspended|expired|revoked|lapsed/i.test(p.status) : /discontinued|withdrawn|suspended|expired|revoked|lapsed/i.test(p.status))) &&
      (!q || C.norm(`${p.brand} ${p.ingredients.join(" ")} ${p.authId}`).includes(q)),
  );
  const body = list.slice(0, shown).map((p) =>
    el(
      "tr",
      {},
      el("td", {}, p.brand),
      el("td", {}, p.ingredients.join(" + ")),
      el("td", {}, MARKETS[p.market] ?? p.market),
      el("td", {}, p.url ? ext(p.url, p.authId ?? "record") : p.authId ?? ""),
      el("td", {}, p.holder, el("br"), el("small", { class: "hint" }, p.role)),
      el("td", {}, p.status),
      el("td", {}, p.date ?? ""),
    ),
  );
  return [
    el("p", { class: "hint" }, "Each row is one authorisation or application in a public register, with the holder named exactly as the source gives it. Authorisation does not prove the product is marketed. Holder, manufacturer, distributor and licensee are different roles; only the holder is shown here."),
    el(
      "div",
      { class: "co-filters" },
      el("div", { class: "field" }, el("label", { for: "pq" }, "Search products"), el("input", { id: "pq", type: "search", value: state.pq, placeholder: "Brand, substance or number", onchange: (e) => set({ pq: e.target.value }) })),
      el("div", { class: "field" }, el("label", { for: "pmarket" }, "Market"), el("select", { id: "pmarket", onchange: (e) => set({ pmarket: e.target.value }) }, [["", "All"], ["US", "United States"], ["EU", "European Union"]].map(([v, t]) => el("option", { value: v, selected: state.pmarket === v }, t)))),
      el("div", { class: "field" }, el("label", { for: "pstatus" }, "Status"), el("select", { id: "pstatus", onchange: (e) => set({ pstatus: e.target.value }) }, [["", "All"], ["current", "Current"], ["past", "Discontinued or withdrawn"]].map(([v, t]) => el("option", { value: v, selected: state.pstatus === v }, t)))),
    ),
    el("h2", {}, `${list.length} product record${list.length === 1 ? "" : "s"}`),
    list.length
      ? el(
          "div",
          { class: "st-table-wrap" },
          el("table", { class: "st-table co-table" }, el("thead", {}, el("tr", {}, ["Product", "Substance", "Market", "Authorisation", "Holder (as in source)", "Status", "Since"].map((h) => el("th", { scope: "col" }, h)))), el("tbody", {}, body)),
        )
      : el("p", { class: "empty" }, data.products.length ? "No products match these filters." : data.coverage.note),
    list.length > shown ? el("button", { type: "button", class: "more", onclick: () => ((shown += PAGE), render()) }, "Show more") : null,
  ];
}

// ---- Sources & coverage ----

function sourcesTab() {
  const p = data.profile;
  const issue = `https://github.com/chalamalasetti/Pharmacovigilance/issues/new?labels=company-correction&title=${encodeURIComponent(`Correction: ${p.name}`)}&body=${encodeURIComponent(`Company page: ${location.href}\n\nWhat is wrong:\n\nSource showing the correct information:\n`)}`;
  return [
    el("h2", {}, "Where the products come from"),
    el(
      "div",
      { class: "st-table-wrap" },
      el(
        "table",
        { class: "st-table" },
        el("thead", {}, el("tr", {}, ["Source", "Status", "Last good copy"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, data.sources.length ? data.sources.map((s) => el("tr", { class: s.ok ? "" : "st-bad" }, el("td", {}, s.name), el("td", {}, s.ok ? "✓ OK" : `⚠ Failing${s.stale ? ", earlier products kept" : ""}`), el("td", {}, time(s.lastSuccess)))) : el("tr", {}, el("td", { colspan: "3" }, "The registry has not been built yet."))),
      ),
    ),
    el("h2", {}, "Holder names linked to this company"),
    data.holders.length
      ? [
          el("p", { class: "hint" }, "These names appear as holders in the sources. Linking each one to this company group is an editorial mapping, which can be corrected."),
          el("ul", {}, data.holders.map((h) => el("li", {}, h.name, el("span", { class: "hint" }, ` · ${h.src === "ema-medicines" ? "EMA" : "FDA Orange Book"} · ${h.products} record${h.products > 1 ? "s" : ""}`)))),
        ]
      : el("p", {}, "No holder names from the current sources are linked to this company yet."),
    el("h2", {}, "How updates are matched"),
    el(
      "ul",
      {},
      C.LANES.map((l) => el("li", {}, el("strong", {}, `${l.label}: `), l.text, ".")),
      el("li", {}, `Name phrases used to spot this company in news: ${p.mentions.join(", ") || "none"}. Short or shared names (such as “Merck” alone) are never used.`),
      el("li", {}, `Matching rules version ${data.rules}. No AI is used; every match shows its reason.`),
    ),
    el("h2", {}, "Not covered"),
    el("ul", {}, el("li", {}, "Nationally authorised products, and markets outside the US and EU."), el("li", {}, "US biologics, vaccines and biosimilars licensed through BLAs (FDA Purple Book, planned)."), el("li", {}, "Transfers of authorisations between companies over time (EU Union Register, planned)."), el("li", {}, "Manufacturing, distribution, licensing and co-marketing relationships.")),
    el("p", {}, ext(issue, "Suggest a correction"), " (opens a public GitHub issue; do not include confidential information)."),
  ];
}

function render() {
  if (!data) return;
  tabs();
  const panel = $("panel");
  panel.setAttribute("aria-labelledby", `tab-${state.tab}`);
  panel.replaceChildren(...[state.tab === "overview" ? overview() : state.tab === "updates" ? related("updates") : state.tab === "research" ? related("research") : state.tab === "products" ? productsTab() : sourcesTab()].flat(3).filter(Boolean));
}

function wire() {
  for (const t of TABS) $(`tab-${t}`).addEventListener("click", () => set({ tab: t }));
  $("tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.indexOf(state.tab);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
    set({ tab: next });
    $(`tab-${next}`).focus();
  });
}

async function main() {
  readUrl();
  if (!/^[a-z0-9-]+$/.test(state.id)) {
    $("head").replaceChildren(el("h1", {}, "Company not found"), el("p", { class: "intro" }, "Choose a company in the ", el("a", { href: "companies.html" }, "Company Explorer"), "."));
    return;
  }
  try {
    const res = await fetch(`data/companies/${state.id}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $("head").replaceChildren(el("h1", {}, "Company not found"), el("p", { class: "intro" }, "There is no company with this address in the coverage list. Try the ", el("a", { href: "companies.html" }, "Company Explorer"), "."));
    return;
  }
  header();
  wire();
  render();
}

main();
