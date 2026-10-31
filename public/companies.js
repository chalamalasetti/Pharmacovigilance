// Company Explorer: search by company, alias, brand or substance, browse by region and
// type, and the coverage manifest's limits. Data from data/companies/index.json and,
// once someone types a product-like query, data/companies/products.json.
// The query, region and type live in the URL so a search can be shared.

import { flag, ago } from "./lib.js";
import * as C from "./companies-lib.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = { q: "", region: "", type: "" };
const REGIONS = ["Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];
const EXAMPLES = ["Pfizer", "Merck", "Genentech", "Teva", "Sun Pharma", "semaglutide"];

let index = null;
let products = null;
let active = -1;
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

const link = (id) => `company.html?id=${encodeURIComponent(id)}`;
const byId = (id) => index.companies.find((c) => c.id === id);

function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) state[k] = p.get(k) ?? DEFAULTS[k];
}
function writeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v) p.set(k, v);
  const qs = p.toString();
  history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
}

async function loadProducts() {
  if (products) return products;
  try {
    const res = await fetch("data/companies/products.json", { cache: "no-cache" });
    if (res.ok) products = await res.json();
  } catch {}
  return products;
}

function coverageBadge(c) {
  return el("span", { class: `co-cov cov-${c.coverage.status}` }, C.COVERAGE[c.coverage.status], c.coverage.products ? ` · ${c.coverage.products} product${c.coverage.products > 1 ? "s" : ""}` : "");
}

function companyCard(c, via) {
  const n = (c.counts?.direct ?? 0) + (c.counts?.substance ?? 0) + (c.counts?.class ?? 0);
  return el(
    "article",
    { class: "co-card" },
    el("h3", {}, el("a", { href: link(c.id) }, c.name)),
    el("a", {class:"act",href:`company-briefing.html?company=${encodeURIComponent(c.id)}`},"Build briefing"),
    el("p", { class: "co-sub" }, `${flag(c.country)} ${c.legal ?? c.name}`, c.parent ? ` · ${c.parent.relation}` : ""),
    via ? el("p", { class: "co-via" }, `Matched ${via}`) : null,
    el("p", { class: "co-meta" }, coverageBadge(c)),
    n ? el("p", { class: "co-sub" }, `${n} related update${n > 1 ? "s" : ""}`) : null,
  );
}

// ---- Autocomplete ----

function suggestions() {
  const q = $("q").value;
  const { results, ambiguous } = C.searchCompanies(index, q, 8);
  const items = results.map((r) => ({ label: r.company.name, sub: r.via ?? `${flag(r.company.country)} ${r.company.region}`, href: link(r.company.id) }));
  if (ambiguous) items.unshift({ label: `“${ambiguous.term}” can mean ${ambiguous.candidates.length} different companies`, sub: "Choose one below", note: true });
  return items;
}

function renderSuggest() {
  const list = $("suggest");
  const items = $("q").value.trim().length >= 2 ? suggestions() : [];
  active = -1;
  list.replaceChildren(
    ...items.map((it, i) =>
      el(
        "li",
        { role: it.note ? "presentation" : "option", id: `opt-${i}`, class: it.note ? "co-opt-note" : "co-opt", "aria-selected": "false", ...(it.href && { "data-href": it.href }), onmousedown: (e) => it.href && (e.preventDefault(), (location.href = it.href)) },
        el("span", {}, it.label),
        el("small", {}, it.sub),
      ),
    ),
  );
  const open = items.length > 0;
  list.hidden = !open;
  $("q").setAttribute("aria-expanded", String(open));
  $("q").removeAttribute("aria-activedescendant");
}

function moveActive(delta) {
  const opts = [...$("suggest").querySelectorAll('[role="option"]')];
  if (!opts.length) return;
  active = (active + delta + opts.length) % opts.length;
  opts.forEach((o, i) => o.setAttribute("aria-selected", String(i === active)));
  $("q").setAttribute("aria-activedescendant", opts[active].id);
}

function closeSuggest() {
  $("suggest").hidden = true;
  $("q").setAttribute("aria-expanded", "false");
}

// ---- Results ----

async function renderResults() {
  const q = state.q.trim();
  $("results-sec").hidden = !q;
  if (!q) return;
  const { results, ambiguous } = C.searchCompanies(index, q, 24);
  $("ambiguous").replaceChildren(
    ambiguous
      ? el("div", { class: "co-amb", role: "note" }, el("strong", {}, `“${ambiguous.term}” refers to more than one company. `), ambiguous.note, " ", ...ambiguous.candidates.flatMap((c, i) => [i ? " or " : "Open ", el("a", { href: link(c.id) }, c.name)]), ".")
      : "",
  );
  $("results-h").textContent = results.length ? `Companies (${results.length})` : "Companies";
  $("results").replaceChildren(...(results.length ? results.map((r) => companyCard(r.company, r.via)) : [el("p", { class: "empty" }, `No company in the coverage list matches “${q}”. `, requestLink(q))]));
  const prods = C.searchProducts(await loadProducts(), q);
  $("product-results").replaceChildren(
    prods.length
      ? el(
          "section",
          { class: "co-prods" },
          el("h2", {}, "Products and substances"),
          el("p", { class: "hint" }, "Companies with a sourced relationship to each product or substance, and the markets where it is sourced. Several companies can hold products with the same substance; this does not mean one company owns it."),
          el(
            "ul",
            { class: "co-prod-list" },
            prods.map((p) =>
              el(
                "li",
                {},
                el("span", { class: "co-kind" }, p.k === "s" ? "Substance" : "Brand"),
                el("strong", {}, p.n),
                el("span", { class: "co-prod-cos" }, ...p.c.flatMap(([id, ms], i) => [i ? ", " : " · ", el("a", { href: `${link(id)}&tab=products&pq=${encodeURIComponent(p.n)}` }, byId(id)?.name ?? id), ` (${ms.replace(",", ", ")})`])),
              ),
            ),
          ),
        )
      : "",
  );
}

const requestLink = (q) =>
  el("a", { href: `https://github.com/chalamalasetti/Pharmacovigilance/issues/new?title=${encodeURIComponent(`Company request: ${q}`)}&labels=company-request&body=${encodeURIComponent(`Please add this company to the Company Explorer.\n\nCompany: ${q}\nWebsite or source:\n`)}`, target: "_blank", rel: "noopener" }, "Request a company");

function renderBrowse() {
  $("regions").replaceChildren(
    el("button", { type: "button", class: "chip", "aria-pressed": String(!state.region), onclick: () => set({ region: "" }) }, "All"),
    ...REGIONS.map((r) => el("button", { type: "button", class: "chip", "aria-pressed": String(state.region === r), onclick: () => set({ region: state.region === r ? "" : r }) }, r)),
  );
  const types = [...new Set(index.companies.flatMap((c) => c.types ?? []))].sort((a, b) => (C.TYPE_LABELS[a] ?? a).localeCompare(C.TYPE_LABELS[b] ?? b));
  $("type").replaceChildren(el("option", { value: "" }, "All types"), ...types.map((t) => el("option", { value: t, selected: state.type === t }, C.TYPE_LABELS[t] ?? t)));
  const list = C.browse(index, state);
  const filtered = state.region || state.type;
  $("browse-n").textContent = filtered ? `${list.length} compan${list.length === 1 ? "y" : "ies"}` : `${index.companies.length} companies. Pick a region or type to narrow the list.`;
  $("browse").replaceChildren(...(filtered ? list.map((c) => companyCard(c)) : []));
  if (!filtered) {
    $("browse").append(
      el("details", { class: "co-az" }, el("summary", {}, "All companies A to Z"), el("ul", { class: "co-az-list" }, list.map((c) => el("li", {}, el("a", { href: link(c.id) }, c.name), el("span", { class: "hint" }, ` ${flag(c.country)}`))))),
    );
  }
}

function renderFollowed() {
  const ids = C.loadFollowed().filter(byId);
  $("followed-sec").hidden = !ids.length;
  $("followed").replaceChildren(...ids.map((id) => companyCard(byId(id))));
}

function renderCoverage() {
  const m = index.manifest;
  const counts = { mapped: 0, partial: 0, "not-mapped": 0 };
  for (const c of index.companies) counts[c.coverage.status]++;
  const reg = index.registry;
  const draft = m.status !== "approved";
  $("draft").hidden = !draft;
  $("draft").textContent = draft ? `Draft coverage list (version ${m.version}), not yet approved. Company names, legal entities and holder mappings may change after review.` : "";
  $("coverage-body").replaceChildren(
    el("p", {}, `${index.companies.length} company groups are searchable (coverage list version ${m.version}, ${draft ? "draft awaiting approval" : `approved${m.approvedOn ? ` on ${m.approvedOn}` : ""}`}). Being searchable is not the same as having every product mapped: ${counts.mapped} have products mapped in both the US and EU sources, ${counts.partial} in one of them, and ${counts["not-mapped"]} have none linked yet.`),
    el("p", {}, "This is not an exhaustive list of companies or products. A company may have a page before its products are mapped. ", requestLink(""), " if one is missing."),
    el("h3", {}, "How companies were chosen"),
    el("ul", {}, m.criteria.map((c) => el("li", {}, c))),
    el("h3", {}, "Sources"),
    el(
      "div",
      { class: "st-table-wrap" },
      el(
        "table",
        { class: "st-table" },
        el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Source"), el("th", { scope: "col" }, "Markets"), el("th", { scope: "col" }, "Status"), el("th", { scope: "col" }, "Limits"))),
        el(
          "tbody",
          {},
          index.register.map((s) => {
            const run = reg?.sources.find((r) => r.id === s.id);
            const status = s.status !== "active" ? "Planned, not collected yet" : !run ? "Not collected yet" : run.ok ? `Collected ${ago(new Date(run.lastSuccess))}` : `Failing${run.lastSuccess ? `; last good copy from ${ago(new Date(run.lastSuccess))} kept` : ""}`;
            return el("tr", { class: run && !run.ok ? "st-bad" : "" }, el("td", {}, s.page ? el("a", { href: s.page, target: "_blank", rel: "noopener" }, s.name) : s.name), el("td", {}, (s.jurisdictions ?? []).join(", ")), el("td", {}, status), el("td", {}, el("ul", { class: "co-limits" }, (s.limitations ?? []).map((l) => el("li", {}, l)))));
          }),
        ),
      ),
    ),
    el("p", { class: "hint" }, "Japan, India, China, Korea and other national registers are not collected yet, so companies from those countries are searchable but their products show only where they hold US or EU authorisations. Marketing authorisation, approval or application status does not prove a product is on the market."),
  );
}

function render() {
  $("q").value = state.q;
  renderResults();
  renderBrowse();
}

function set(patch) {
  Object.assign(state, patch);
  writeUrl();
  render();
}

function wire() {
  const q = $("q");
  q.addEventListener("input", renderSuggest);
  q.addEventListener("focus", renderSuggest);
  q.addEventListener("blur", () => setTimeout(closeSuggest, 100));
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") (e.preventDefault(), $("suggest").hidden && renderSuggest(), moveActive(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), moveActive(-1));
    else if (e.key === "Escape") closeSuggest();
    else if (e.key === "Enter") {
      e.preventDefault();
      const opt = active >= 0 ? $("suggest").querySelectorAll('[role="option"]')[active] : null;
      if (opt?.dataset.href) location.href = opt.dataset.href;
      else {
        closeSuggest();
        set({ q: q.value.trim() });
      }
    }
  });
  $("type").addEventListener("change", (e) => set({ type: e.target.value }));
  $("examples").replaceChildren(...EXAMPLES.flatMap((x, i) => [i ? " · " : "", el("button", { type: "button", class: "link", onclick: () => set({ q: x }) }, x)]));
}

async function main() {
  readUrl();
  try {
    const res = await fetch("data/companies/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    index = await res.json();
  } catch {
    $("coverage-body").replaceChildren(el("p", { class: "empty" }, "The company list has not been published yet. It appears after the next build."));
    $("browse-sec").hidden = true;
    return;
  }
  wire();
  render();
  renderFollowed();
  renderCoverage();
}

main();
