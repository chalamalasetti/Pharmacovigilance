// Public Safety Data Resources (resources.html): the curated directory of public safety
// databases, from data/resources.json (built from Admin → Safety data resources).
// Readers filter by country, category, product type, access and data availability, ask
// in plain words ("Find adverse-event data for Japan"), use the "Which resource should I
// use?" guide, keep favorites (this browser, synced when signed in) and send suggestions
// or corrections. The filters live in the URL so a view can be shared. Viewing never
// needs sign-in or the database.

import { flag } from "./lib.js";
import { el } from "./impact-view.js";
import * as workspace from "./workspace.js";
import * as cloud from "./cloud.js";
import * as R from "./resources-lib.js";

const $ = (id) => document.getElementById(id);
const DEFAULTS = { q: "", country: "", category: "", product: "", access: "", data: "", fav: "", guide: "" };
const state = { ...DEFAULTS };

let data = null;
let countries = []; // agencies.json
let names = new Map(); // country code → name
const ws = workspace.load();
const favs = () => new Set(Object.keys(ws.resourceFavs ?? {}));
let reportOpen = null; // resource id whose report form is open

const countryName = (c) => (c === "INT" ? "International" : names.get(c) ?? c);
const fmtDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

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

// The page's controls plus what the search box understood. A control the reader set wins
// over the same thing read from the search words.
function filters() {
  const parsed = R.parseQuery(state.q, countries);
  const [category, specialty] = state.category.split(":");
  const f = {
    country: state.country || parsed.country,
    category: category || (specialty ? "" : parsed.category),
    specialty: specialty || parsed.specialty,
    product: state.product || parsed.product,
    access: state.access,
    data: state.data || parsed.data,
    words: parsed.words,
    favorites: state.fav === "1",
    favs: favs(),
  };
  if (f.country === "INT") f.country = "";
  return { f, parsed };
}

// ── Controls ────────────────────────────────────────────────────────────────

function select(key, all, options) {
  return el("label", { class: "rs-sel" }, el("span", { class: "label" }, all.label),
    el("select", { "aria-label": all.label, onchange: (e) => set({ [key]: e.target.value, guide: "" }) },
      el("option", { value: "" }, all.any), options.map((o) => (o.group
        ? el("optgroup", { label: o.group }, o.options.map((x) => el("option", { value: x.id, selected: state[key] === x.id || null }, x.label)))
        : el("option", { value: o.id, selected: state[key] === o.id || null }, o.label)))));
}

function renderControls() {
  const present = Object.keys(data.byCountry).filter((c) => c !== "INT").sort((a, b) => countryName(a).localeCompare(countryName(b)));
  const nFav = favs().size;
  $("filters").replaceChildren(...[
    select("country", { label: "Country", any: "All countries" }, present.map((c) => ({ id: c, label: `${flag(c)} ${countryName(c)}` }))),
    select("category", { label: "Category", any: "All categories" }, [
      ...R.CATEGORIES.filter((c) => c.id !== "specialist").map((c) => ({ id: c.id, label: c.label })),
      { group: "Specialist resources", options: [{ id: "specialist", label: "All specialist resources" }, ...R.SPECIALTIES.map((s) => ({ id: `specialist:${s.id}`, label: s.label }))] },
    ]),
    select("product", { label: "Product type", any: "Medicines, vaccines, devices" }, R.PRODUCTS),
    select("access", { label: "Access", any: "Any access" }, R.ACCESS_FILTERS),
    select("data", { label: "Download or API", any: "Any" }, R.DATA_FILTERS),
    el("div", { class: "rs-sel" }, el("span", { class: "label" }, "Favorites"),
      el("button", { type: "button", class: "chip", "aria-pressed": String(state.fav === "1"), onclick: () => set({ fav: state.fav === "1" ? "" : "1" }) }, `★ Favorites${nFav ? ` (${nFav})` : ""}`)),
    Object.entries(state).some(([k, v]) => v && k !== "guide") ? el("button", { type: "button", class: "reset", onclick: () => set({ ...DEFAULTS }) }, "Clear all") : null,
  ].filter(Boolean));
  $("guide").replaceChildren(...R.GUIDE.map((g) => el("button", { type: "button", class: "chip rs-q", "aria-pressed": String(state.guide === g.id), onclick: () => applyGuide(g) }, g.question)));
  const g = R.GUIDE.find((x) => x.id === state.guide);
  $("guide-tip").textContent = g ? g.tip : "";
  if ($("q").value !== state.q) $("q").value = state.q;
}

function applyGuide(g) {
  if (state.guide === g.id) return set({ guide: "", category: "", data: "" });
  // Keeps the reader's country, so "Where can I find an official warning?" answers for their country.
  set({ guide: g.id, q: "", category: g.filters.category ?? "", data: g.filters.data ?? "", product: "", access: "", fav: "" });
  $("list").scrollIntoView({ behavior: "smooth", block: "start" });
}

function set(patch) {
  Object.assign(state, patch);
  writeUrl();
  render();
}

// ── Cards ───────────────────────────────────────────────────────────────────

const yesNo = (v) => (v ? "Yes" : "No");

function card(r, f) {
  const fav = favs().has(r.id);
  const c = r.coverage;
  const row = (term, value) => (value ? [el("dt", {}, term), el("dd", {}, value)] : []);
  return el("article", { class: `card rs-card${r.linkStatus === "broken" ? " rs-broken" : ""}`, id: `r-${r.id}` },
    el("div", { class: "rs-head" },
      el("div", {},
        el("h3", {}, el("a", { href: r.url, target: "_blank", rel: "noopener" }, r.name)),
        el("p", { class: "rs-org" }, r.organization)),
      el("button", { type: "button", class: "act rs-fav", "aria-pressed": String(fav), "aria-label": fav ? `Remove ${r.name} from favorites` : `Add ${r.name} to favorites`, onclick: () => {
        R.toggleFavorite(ws, r.id);
        workspace.save(ws);
        render();
      } }, fav ? "★ Favorite" : "☆ Favorite")),
    el("div", { class: "imp-chips" },
      r.categories.map((id) => el("span", { class: "chip-s" }, R.CATEGORIES.find((x) => x.id === id).short)),
      r.specialties.map((id) => el("span", { class: "chip-s sub" }, R.label(R.SPECIALTIES, id))),
      r.countries.map((code) => el("span", { class: `chip-s${f.country && code === f.country ? " place" : ""}` }, `${flag(code)} ${countryName(code)}`)),
      r.collected ? el("span", { class: "chip-s rs-collected", title: "PV Info also collects updates from this resource" }, "✓ In PV Info updates") : null),
    r.linkStatus === "broken" ? el("p", { class: "warn" }, "⚠ This link was reported as not working. An editor is checking it.") : null,
    el("p", { class: "rs-purpose" }, el("b", {}, "Helps answer: "), r.purpose),
    el("dl", { class: "rs-facts" },
      el("div", {}, el("h4", {}, "Data coverage"), el("dl", {}, ...row("Countries", c.countries), ...row("Products", c.products), ...row("Report types", c.reportTypes), ...row("Years", c.years))),
      el("div", {}, el("h4", {}, "Access"), el("dl", {},
        ...row("Who can access", R.label(R.PUBLIC_ACCESS, r.access.publicAccess)),
        ...row("Public search", yesNo(r.access.search)),
        ...row("Downloads", R.label(R.DOWNLOAD, r.access.download)),
        ...row("API", R.label(R.API, r.access.api))),
        r.access.note ? el("p", { class: "hint" }, r.access.note) : null),
      el("div", {}, el("h4", {}, "Reuse of data"), el("p", { class: `rs-reuse u-${r.reuse.status}` }, R.label(R.REUSE, r.reuse.status)), r.reuse.note ? el("p", { class: "hint" }, r.reuse.note) : null),
      el("div", {}, el("h4", {}, "Limitations"), el("p", {}, r.limitations))),
    el("div", { class: "row rs-links" },
      el("a", { class: "btn primary", href: r.url, target: "_blank", rel: "noopener" }, "Open official resource ↗"),
      r.links.map((l) => el("a", { class: "btn", href: l.url, target: "_blank", rel: "noopener" }, `${l.label} ↗`))),
    el("p", { class: "rs-foot" },
      el("span", {}, `Last verified ${fmtDate(r.verified.on)} · ${r.verified.method === "editor" ? "checked by a PV Info editor" : "automated check of the official page, awaiting editor review"}`),
      el("button", { type: "button", class: "link", "aria-expanded": String(reportOpen === r.id), onclick: () => ((reportOpen = reportOpen === r.id ? null : r.id), render()) }, "Report incorrect information")),
    reportOpen === r.id ? feedbackForm("report", r) : null);
}

// ── Suggest and report ──────────────────────────────────────────────────────

function feedbackForm(kind, r = null) {
  const status = el("p", { class: "hint", role: "status" });
  const field = (lbl, input) => el("label", { class: "rs-field" }, el("span", {}, lbl), input);
  const form = el("form", { class: "imp-form rs-form", onsubmit: async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    if (v.website) return; // filled in only by bots
    status.textContent = "Sending…";
    const sb = await cloud.client();
    if (!sb) return void (status.textContent = "Messages can't be sent from this copy of the site, because it was built without the database.");
    const { error } = await sb.rpc("submit_resource_feedback", { kind, resource_id: r?.id ?? null, name: v.name ?? "", url: v.url ?? "", message: v.message ?? "", contact: v.contact ?? "" });
    if (error) return void (status.textContent = error.message);
    form.replaceChildren(el("p", {}, kind === "report" ? "Thank you. An editor will check this resource." : "Thank you. An editor will check the resource against its official source before adding it."));
  } },
    kind === "suggest" ? [
      field("Resource name", el("input", { name: "name", required: true, maxlength: 200 })),
      field("Official link", el("input", { name: "url", type: "url", placeholder: "https://", maxlength: 2000 })),
      field("What it contains and why it is useful", el("textarea", { name: "message", rows: 3, required: true, minlength: 5, maxlength: 2000 })),
    ] : [
      field(`What is wrong or out of date for ${r.name}?`, el("textarea", { name: "message", rows: 3, required: true, minlength: 5, maxlength: 2000, placeholder: "For example: the link moved, downloads now need registration, the years covered changed" })),
    ],
    field("Your email (optional, only if you'd like a reply)", el("input", { name: "contact", type: "email", maxlength: 200 })),
    el("input", { name: "website", tabindex: "-1", autocomplete: "off", class: "rs-hp", "aria-hidden": "true" }),
    el("div", { class: "row" }, el("button", { type: "submit", class: "primary" }, kind === "report" ? "Send correction" : "Send suggestion"), status));
  return form;
}

// ── List ────────────────────────────────────────────────────────────────────

function understood(parsed, f) {
  const bits = [];
  if (parsed.country && !state.country) bits.push(parsed.country === "INT" ? "International resources" : `${flag(parsed.country)} ${countryName(parsed.country)}`);
  if (parsed.category && !state.category) bits.push(R.CATEGORIES.find((c) => c.id === parsed.category).label);
  if (parsed.specialty && !state.category) bits.push(R.label(R.SPECIALTIES, parsed.specialty));
  if (parsed.product && !state.product) bits.push(R.label(R.PRODUCTS, parsed.product));
  if (parsed.data && !state.data) bits.push(R.label(R.DATA_FILTERS, parsed.data));
  if (f.words.length) bits.push(`matching “${f.words.join(" ")}”`);
  $("understood").replaceChildren(...(state.q && bits.length ? [el("span", { class: "hint" }, "Showing: "), ...bits.map((b) => el("span", { class: "chip-s place" }, b))] : []));
}

function render() {
  renderControls();
  const { f, parsed } = filters();
  understood(parsed, f);
  const list = R.rank(data.resources.filter((r) => R.matches(r, f)), f);
  const where = f.country ? ` for ${countryName(f.country)}` : "";
  $("count").textContent = `${list.length} of ${data.total} resources${where}`;
  if (!list.length) {
    $("list").replaceChildren(el("p", { class: "empty" }, f.favorites && !f.favs.size ? "You have no favorites yet. Choose ☆ Favorite on a resource to keep it here." : "No resource matches. Try fewer filters, or suggest a resource below."));
    return;
  }
  const out = [];
  if (f.country) {
    // The country's own resources first, then international ones that also cover it.
    const own = list.filter((r) => R.countrySpecific(r, f.country));
    const intl = list.filter((r) => !R.countrySpecific(r, f.country));
    out.push(...own.map((r) => card(r, f)));
    if (intl.length) out.push(el("h2", { class: "rs-group" }, `International resources that include ${countryName(f.country)} (${intl.length})`), ...intl.map((r) => card(r, f)));
  } else if (!f.category && !f.specialty) {
    // Grouped by each resource's main category.
    for (const c of R.CATEGORIES) {
      const inCat = list.filter((r) => r.categories[0] === c.id);
      if (inCat.length) out.push(el("h2", { class: "rs-group" }, `${c.label} (${inCat.length})`), ...inCat.map((r) => card(r, f)));
    }
  } else out.push(...list.map((r) => card(r, f)));
  $("list").replaceChildren(...out);
}

async function main() {
  readUrl();
  $("q").value = state.q;
  let timer;
  $("q").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => set({ q: e.target.value.trim(), guide: "" }), 250);
  });
  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(timer);
    set({ q: $("q").value.trim(), guide: "" });
  });
  const [res, ag] = await Promise.all([
    fetch("data/resources.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("data/agencies.json").then((r) => r.json()).catch(() => []),
  ]);
  countries = ag;
  names = new Map(ag.map((c) => [c.code, c.country]));
  $("coverage-text").textContent = res?.coverage ?? R.COVERAGE_STATEMENT;
  $("suggest-form").replaceChildren(feedbackForm("suggest"));
  if (!res?.resources?.length) {
    $("count").textContent = "";
    $("list").replaceChildren(el("p", { class: "empty" }, "The directory hasn't been built yet. Run ", el("code", {}, "npm run build"), " and reload."));
    return;
  }
  data = res;
  render();
  // Favorites follow a signed-in reader across devices; everyone else keeps them in this browser.
  if (await cloud.client()) {
    cloud.team.me = await cloud.startSync(ws, render);
    cloud.markNav();
  }
}

main();
