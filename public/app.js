// Renders public/data/updates.json as a filterable list. Filters live in the URL
// (so a filtered view can be shared) and followed countries live in localStorage.
// Each update opens into an impact card with save, follow, assess, assign and dismiss.

import { flag, ago, dayLabel, matches, keyUpdates, REGIONS } from "./lib.js";
import { impactSection, statusBadges } from "./impact-view.js";
import * as workspace from "./workspace.js";
import { initCloud } from "./cloud.js";

const $ = (id) => document.getElementById(id);
const PAGE = 50;
const DEFAULTS = { q: "", region: "", country: "", cat: "", kind: "", days: "30", mine: "" };

let data = null;
let shown = PAGE;
const ws = workspace.load();
const state = { ...DEFAULTS };

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

const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem("pv-follow") || "[]");
    } catch {
      return [];
    }
  },
  set(list) {
    try {
      localStorage.setItem("pv-follow", JSON.stringify(list));
    } catch {}
  },
};

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

const countryName = (code) => data.countries.find((c) => c.code === code)?.country ?? code;
const catLabel = (id) => data.categories.find((c) => c.id === id)?.label ?? id;

function renderFilters() {
  $("q").value = state.q;
  $("days").value = state.days;

  $("regions").replaceChildren(
    ...["", ...REGIONS].map((r) =>
      el("button", { type: "button", class: "chip", "aria-pressed": String(state.region === r), onclick: () => set({ region: r, country: "" }) }, r || "All"),
    ),
  );

  const options = data.countries
    .filter((c) => !state.region || c.region === state.region)
    .map((c) => el("option", { value: c.code, selected: state.country === c.code }, `${flag(c.code)} ${c.country} (${c.count})`));
  $("country").replaceChildren(el("option", { value: "" }, state.region ? `All of ${state.region}` : "All countries"), ...options);

  const followed = store.get();
  $("follow").hidden = !state.country;
  $("follow").textContent = followed.includes(state.country) ? `★ Following ${countryName(state.country)}` : `☆ Follow ${countryName(state.country)}`;
  $("mine-wrap").hidden = !followed.length;
  $("mine").checked = state.mine === "1";
  $("mine-list").textContent = followed.length ? `(${followed.map(flag).join(" ")})` : "";

  $("cats").replaceChildren(
    el("li", {}, el("button", { type: "button", class: "cat", "aria-pressed": String(!state.cat), onclick: () => set({ cat: "" }) }, "All topics")),
    ...data.categories
      .filter((c) => c.count)
      .map((c) =>
        el("li", {}, el("button", { type: "button", class: `cat c-${c.id}`, "aria-pressed": String(state.cat === c.id), onclick: () => set({ cat: c.id }) }, el("span", { class: "dot" }), c.label, el("span", { class: "n" }, String(c.count)))),
      ),
  );

  for (const b of $("kind").children) b.setAttribute("aria-pressed", String(b.dataset.v === state.kind));
  renderActive();
}

// The filters in use, as removable chips above the list, so a narrowed view is never a mystery.
function renderActive() {
  const days = { 7: "Last 7 days", 60: "Last 60 days" };
  const active = [
    state.q && [`“${state.q}”`, { q: "" }],
    state.region && [state.region, { region: "", country: "" }],
    state.country && [`${flag(state.country)} ${countryName(state.country)}`, { country: "" }],
    state.cat && [catLabel(state.cat), { cat: "" }],
    state.kind && [state.kind === "official" ? "Regulators only" : "News only", { kind: "" }],
    days[state.days] && [days[state.days], { days: DEFAULTS.days }],
    state.mine && ["Countries I follow", { mine: "" }],
  ].filter(Boolean);
  $("active").hidden = !active.length;
  $("active").replaceChildren(
    el("span", { class: "label" }, "Showing"),
    ...active.map(([text, patch]) => el("button", { type: "button", class: "chip on", "aria-label": `Remove filter: ${text}`, onclick: () => set(patch) }, text, el("span", { "aria-hidden": "true" }, " ×"))),
    el("button", { type: "button", class: "link", onclick: reset }, "Clear all"),
  );
  $("show-filters").textContent = active.length ? `Search & filters (${active.length})` : "Search & filters";
}

function card(u, { compact = false } = {}) {
  const when = u.published ? new Date(u.published) : null;
  const badges = el("span", { class: "ws-badges" }, statusBadges(workspace.item(ws, u.id)));
  const box = el("div", { class: "impact-box" });
  const toggle = el("button", { type: "button", class: "imp-toggle", "aria-expanded": "false" }, "Impact card ▾");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide impact card ▴" : "Impact card ▾";
    box.replaceChildren(
      open ? impactSection(u, { ws, countryName, onChange: () => badges.replaceChildren(...statusBadges(workspace.item(ws, u.id))) }) : "",
    );
  });
  return el(
    "article",
    { class: `card c-${u.category}${u.kind === "official" ? " official" : ""}${workspace.item(ws, u.id).dismissed ? " dismissed" : ""}` },
    el(
      "div",
      { class: "meta" },
      el("span", { class: "tag" }, catLabel(u.category)),
      el("button", { type: "button", class: "where", title: `Show only ${countryName(u.country)}`, onclick: () => set({ country: u.country, region: "" }) }, `${flag(u.country)} ${countryName(u.country)}`),
      u.kind === "official" ? el("span", { class: "badge" }, "Official") : null,
      badges,
    ),
    el("h3", {}, el("a", { href: u.link, target: "_blank", rel: "noopener" }, u.title)),
    !compact && u.summary ? el("p", { class: "summary" }, u.summary.length > 280 ? `${u.summary.slice(0, 277)}…` : u.summary) : null,
    el(
      "div",
      { class: "src" },
      el("span", {}, u.agency && !u.source.includes(u.agency) ? `${u.source} · ${u.agency}` : u.source),
      when ? el("time", { datetime: u.published, title: when.toLocaleString() }, ago(when)) : null,
    ),
    compact ? null : toggle,
    compact ? null : box,
  );
}

function render() {
  const followed = store.get();
  const filter = { ...state, followed: state.mine === "1" ? followed : null, now: Date.now() };
  const list = data.updates.filter((u) => matches(u, filter));

  const key = keyUpdates(data.updates.filter((u) => matches(u, { ...filter, cat: "", days: "7" })), 6);
  $("key").hidden = !key.length || Boolean(state.q);
  $("key-grid").replaceChildren(...key.map((u) => card(u, { compact: true })));

  const scope = [state.country ? countryName(state.country) : state.region, state.cat ? catLabel(state.cat) : ""].filter(Boolean).join(" · ");
  $("count").textContent = `${list.length} update${list.length === 1 ? "" : "s"}${scope ? ` · ${scope}` : ""}`;

  const items = [];
  let day = null;
  for (const u of list.slice(0, shown)) {
    const d = u.published ? dayLabel(new Date(u.published)) : "Undated";
    if (d !== day) items.push(el("h4", { class: "day" }, (day = d)));
    items.push(card(u));
  }
  if (!list.length) {
    items.push(el("p", { class: "empty" }, "Nothing matches these filters. Try a longer time window, another topic or ", el("button", { type: "button", class: "link", onclick: reset }, "clear the filters"), "."));
  }
  $("list").replaceChildren(...items);
  $("more").hidden = list.length <= shown;
}

function set(patch) {
  Object.assign(state, patch);
  shown = PAGE;
  writeUrl();
  renderFilters();
  render();
}

function reset() {
  set({ ...DEFAULTS });
}

function wire() {
  let t;
  $("q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => set({ q: e.target.value.trim() }), 150);
  });
  $("country").addEventListener("change", (e) => set({ country: e.target.value }));
  $("days").addEventListener("change", (e) => set({ days: e.target.value }));
  $("mine").addEventListener("change", (e) => set({ mine: e.target.checked ? "1" : "" }));
  $("kind").addEventListener("click", (e) => e.target.dataset && "v" in e.target.dataset && set({ kind: e.target.dataset.v }));
  $("reset").addEventListener("click", reset);
  $("more").addEventListener("click", () => {
    shown += PAGE;
    render();
  });
  $("follow").addEventListener("click", () => {
    const list = store.get();
    store.set(list.includes(state.country) ? list.filter((c) => c !== state.country) : [...list, state.country]);
    renderFilters();
  });
  $("welcome-close").addEventListener("click", () => {
    $("welcome").hidden = true;
    try {
      localStorage.setItem("pv-welcomed", "1");
    } catch {}
  });
  $("show-filters").addEventListener("click", () => {
    const open = document.body.classList.toggle("filters-open");
    $("show-filters").setAttribute("aria-expanded", String(open));
  });
}

function welcome() {
  try {
    $("welcome").hidden = Boolean(localStorage.getItem("pv-welcomed"));
  } catch {}
}

async function main() {
  readUrl();
  wire();
  welcome();
  try {
    const res = await fetch("data/updates.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $("count").textContent = "No updates yet";
    $("list").replaceChildren(el("p", { class: "empty" }, "The update list hasn't been built. Run ", el("code", {}, "npm run aggregate"), " (or ", el("code", {}, "npm run app"), ") and reload."));
    return;
  }
  const when = new Date(data.updated);
  $("updated").textContent = `Updated ${ago(when)} · ${data.feeds.ok} of ${data.feeds.total} sources reachable`;
  $("updated").title = when.toLocaleString();
  renderFilters();
  render();
  initCloud(ws, render);
}

main();
