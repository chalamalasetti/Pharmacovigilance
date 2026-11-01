// Public update browsing; workspace actions remain private. Diagnostics require an admin role.
import { flag, ago, dayLabel, matches, REGIONS } from "./lib.js";
import { impactSection, statusBadges } from "./impact-view.js";
import * as workspace from "./workspace.js";
import { initCloud } from "./cloud.js";
import { watchAdmin } from "./admin-visibility.js";
import {
  DEFAULT_FILTERS,
  homepageData,
  excerpt,
  dateLabel,
  feedHealth,
  coverageSummary,
  feedbackLink,
  priorityPicks,
  agencyName,
  coverageLine,
} from "./home-lib.js";
const $ = (id) => document.getElementById(id),
  PAGE = 30,
  ws = workspace.load();
let data = null,
  shown = PAGE,
  coNames = new Map(),
  remoteStatus = null,
  admin = false,
  loadId = 0,
  controller = null,
  cloudStarted = false,
  searchTimer;
const state = { ...DEFAULT_FILTERS };
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  n.append(...kids.flat().filter((x) => x != null && x !== false));
  return n;
};
const countryName = (code) =>
    data?.countries.find((c) => c.code === code)?.country ?? code,
  catLabel = (id) => data?.categories.find((c) => c.id === id)?.label ?? id;
const store = {
  get() {
    try {
      const a = JSON.parse(localStorage.getItem("pv-follow") || "[]");
      return Array.isArray(a)
        ? a.filter((x) => typeof x === "string").slice(0, 200)
        : [];
    } catch {
      return [];
    }
  },
  set(a) {
    try {
      localStorage.setItem("pv-follow", JSON.stringify(a));
    } catch {}
  },
};
function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULT_FILTERS))
    state[k] = p.get(k) ?? DEFAULT_FILTERS[k];
  if (!["7", "30", "60"].includes(state.days)) state.days = "30";
  if (!["", "official", "news"].includes(state.kind)) state.kind = "";
  state.mine = state.mine === "1" ? "1" : "";
}
function writeUrl() {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state))
    if (v && v !== DEFAULT_FILTERS[k]) p.set(k, v);
  history.replaceState(null, "", p.size ? "?" + p : location.pathname);
}
function set(patch) {
  if (!data) return;
  if ("q" in patch) clearTimeout(searchTimer);
  Object.assign(state, patch);
  shown = PAGE;
  writeUrl();
  renderFilters();
  render();
}
const reset = () => set({ ...DEFAULT_FILTERS });
function renderFilters() {
  if (!data) return;
  $("q").value = state.q;
  $("days").value = state.days;
  $("regions").replaceChildren(
    ...["", ...REGIONS].map((r) =>
      el(
        "button",
        {
          type: "button",
          class: "chip",
          "aria-pressed": String(state.region === r),
          onclick: () => set({ region: r, country: "" }),
        },
        r || "All regions",
      ),
    ),
  );
  const countries = data.countries.filter(
      (c) => !state.region || c.region === state.region,
    ),
    unknown = state.country && !countries.some((c) => c.code === state.country);
  $("country").replaceChildren(
    el(
      "option",
      { value: "" },
      state.region ? "All of " + state.region : "All countries / bodies",
    ),
    ...(unknown
      ? [
          el(
            "option",
            { value: state.country, selected: true },
            countryName(state.country) + " · outside this view",
          ),
        ]
      : []),
    ...countries.map((c) =>
      el(
        "option",
        { value: c.code, selected: c.code === state.country },
        `${flag(c.code)} ${c.country}`,
      ),
    ),
  );
  $("topic").replaceChildren(
    el("option", { value: "" }, "All topics"),
    ...(state.cat && !data.categories.some((c) => c.id === state.cat)
      ? [
          el(
            "option",
            { value: state.cat, selected: true },
            "Topic not in this snapshot",
          ),
        ]
      : []),
    ...data.categories.map((c) =>
      el("option", { value: c.id, selected: c.id === state.cat }, `${c.label}`),
    ),
  );
  const followed = store.get();
  $("follow").hidden = !state.country;
  $("follow").textContent = followed.includes(state.country)
    ? "★ Following " + countryName(state.country)
    : "☆ Follow " + countryName(state.country);
  $("mine-wrap").hidden = !followed.length;
  $("mine").checked = state.mine === "1";
  $("mine-list").textContent = followed.length
    ? "(" + followed.map(countryName).join(", ") + ")"
    : "";
  for (const b of $("kind").children)
    b.setAttribute("aria-pressed", String(b.dataset.v === state.kind));
  renderActive();
}
function renderActive() {
  const active = [
    state.q && ["Search: " + state.q, { q: "" }],
    state.region && [state.region, { region: "", country: "" }],
    state.country && [countryName(state.country), { country: "" }],
    state.cat && [catLabel(state.cat), { cat: "" }],
    state.kind && [
      state.kind === "official" ? "Regulator feeds" : "News coverage",
      { kind: "" },
    ],
    state.days !== "30" && ["Last " + state.days + " days", { days: "30" }],
    state.mine && ["Countries I follow", { mine: "" }],
    state.co && [
      "Related to " + (coNames.get(state.co) ?? state.co),
      { co: "" },
    ],
  ].filter(Boolean);
  $("active").hidden = !active.length;
  $("active").replaceChildren(
    el("span", { class: "label" }, "Active filters"),
    ...active.map(([label, patch]) =>
      el(
        "button",
        {
          type: "button",
          class: "chip on",
          "aria-label": "Remove filter: " + label,
          onclick: () => set(patch),
        },
        label,
        " ×",
      ),
    ),
    el(
      "button",
      { type: "button", class: "link", onclick: reset },
      "Reset all",
    ),
  );
}
const forCompany = (u) =>
  !state.co ||
  (u.co ?? []).some((m) => m.id === state.co && m.lane !== "corporate");
function companiesLine(u) {
  const a = (u.co ?? []).filter(
    (m) => m.lane !== "corporate" && coNames.has(m.id),
  );
  if (!a.length) return null;
  return el(
    "p",
    { class: "why co-related" },
    "Related companies: ",
    ...a.slice(0, 4).flatMap((m, i) => [
      i ? ", " : "",
      el(
        "a",
        {
          href: "company.html?id=" + encodeURIComponent(m.id) + "&tab=updates",
          title: m.lane + " match; confirm relevance on the company page",
        },
        coNames.get(m.id),
      ),
      ` (${m.lane})`,
    ]),
    a.length > 4 ? ` and ${a.length - 4} more` : "",
  );
}
function card(u, { compact = false } = {}) {
  const badges = el(
      "span",
      { class: "ws-badges" },
      statusBadges(workspace.item(ws, u.id)),
    ),
    box = el("div", {
      class: "impact-box",
      id: "impact-" + u.id + "-" + (compact ? "key" : "list"),
    }),
    text = excerpt(u, compact ? 160 : 260),
    agency = agencyName(u);
  const toggle = el(
    "button",
    {
      type: "button",
      class: "imp-toggle",
      "aria-expanded": "false",
      "aria-controls": box.id,
    },
    "Impact card · review prompts ▾",
  );
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open
      ? "Hide impact card ▴"
      : "Impact card · review prompts ▾";
    box.replaceChildren(
      ...(open
        ? [
            el(
              "p",
              { class: "home-impact-note hint" },
              "PV Info interpretation · keyword-based prompts. Confirm the source and company applicability before acting.",
            ),
            impactSection(u, {
              ws,
              countryName,
              onChange: () =>
                badges.replaceChildren(
                  ...statusBadges(workspace.item(ws, u.id)),
                ),
            }),
          ]
        : []),
    );
  });
  return el(
    "article",
    {
      class: `card c-${u.category}${u.kind === "official" ? " official" : ""}${workspace.item(ws, u.id).dismissed ? " dismissed" : ""}`,
    },
    el(
      "div",
      { class: "meta" },
      el("span", { class: "tag" }, catLabel(u.category)),
      el(
        "button",
        {
          type: "button",
          class: "where",
          title: "Show only " + countryName(u.country),
          onclick: () => set({ country: u.country, region: "" }),
        },
        flag(u.country) + " " + countryName(u.country),
      ),
      el(
        "span",
        { class: u.kind === "official" ? "badge" : "badge badge-news" },
        u.kind === "official" ? "Regulator feed" : "News coverage",
      ),
      badges,
    ),
    agency
      ? el(
          "p",
          { class: "agency-label" },
          (u.kind === "official" ? "Agency: " : "Agency mentioned: ") + agency,
        )
      : null,
    el(
      "h3",
      {},
      el(
        "a",
        { href: u.link, target: "_blank", rel: "noopener noreferrer" },
        u.title,
      ),
    ),
    el(
      "p",
      { class: "home-card-date" },
      u.published
        ? [
            "Published ",
            el(
              "time",
              {
                datetime: u.published,
                title: new Date(u.published).toLocaleString(),
              },
              dateLabel(u.published),
            ),
            " · " + ago(new Date(u.published)),
          ]
        : "Publication date not supplied",
    ),
    el(
      "p",
      { class: "card-summary" },
      text
        ? [el("b", {}, "Source excerpt"), text]
        : "This feed provides a headline only. Open the original publication for details.",
    ),
    el("p", { class: "home-card-source" }, "Source: " + u.source),
    compact ? null : companiesLine(u),
    el(
      "div",
      { class: "home-card-footer" },
      el(
        "a",
        { href: u.link, target: "_blank", rel: "noopener noreferrer" },
        u.kind === "official" ? "Original notice ↗" : "Original report ↗",
      ),
      compact
        ? null
        : el(
            "a",
            {
              href: feedbackLink(u),
              target: "_blank",
              rel: "noopener noreferrer",
              title:
                "Opens a public GitHub feedback draft; do not include private or personal information",
            },
            "Suggest a correction ↗",
          ),
    ),
    compact ? null : toggle,
    compact ? null : box,
  );
}
function render() {
  if (!data) return;
  const f = {
      ...state,
      followed: state.mine === "1" ? store.get() : null,
      now: Date.now(),
    },
    passes = (u, filters) =>
      matches(
        {
          ...u,
          source: `${u.source} ${countryName(u.country)} ${u.region ?? ""} ${catLabel(u.category)}`,
        },
        filters,
      ) && forCompany(u),
    list = data.updates.filter((u) => passes(u, f));
  const key = priorityPicks(
    data.updates.filter((u) => passes(u, { ...f, days: "7" })),
  );
  $("key").hidden = !key.length || !!state.q;
  $("key-grid").replaceChildren(...key.map((u) => card(u, { compact: true })));
  $("count").textContent =
    `${list.length} update${list.length === 1 ? "" : "s"}`;
  $("window-label").textContent =
    `Last ${state.days} days · undated items included`;
  const items = [];
  let day = null;
  for (const u of list.slice(0, shown)) {
    const next = u.published
      ? dayLabel(new Date(u.published))
      : "Publication date not supplied";
    if (day !== next) items.push(el("h3", { class: "day" }, (day = next)));
    items.push(card(u));
  }
  if (!list.length)
    items.push(
      el(
        "div",
        { class: "empty" },
        el(
          "h3",
          {},
          data.updates.length
            ? "No updates match these filters"
            : "No updates in this snapshot",
        ),
        el(
          "p",
          {},
          data.updates.length
            ? "Try fewer search words, another country or topic, or a longer publication window."
            : "The feed is readable, but no items were published in this snapshot. Explore source coverage or try again later.",
        ),
        data.updates.length
          ? el(
              "button",
              { type: "button", class: "btn", onclick: reset },
              "Reset all filters",
            )
          : el("a", { href: "coverage.html" }, "Explore source coverage"),
      ),
    );
  $("list").replaceChildren(...items);
  $("list").setAttribute("aria-busy", "false");
  $("more").hidden = list.length <= shown;
  $("snapshot-label").hidden = true;
  renderHealth();
}
function renderHealth() {
  if (!admin) return;
  const h = feedHealth(data, remoteStatus),
    panel = $("home-health");
  panel.dataset.level = h.level;
  $("snapshot-time").textContent = h.updated
    ? dateLabel(h.updated) + " · " + ago(new Date(h.updated))
    : "Snapshot time unavailable";
  $("source-checks").textContent = h.feeds
    ? `${h.feeds.ok} of ${h.feeds.total} sources reachable${h.checked ? " · checked " + ago(new Date(h.checked)) : ""}`
    : "Source check count unavailable";
  $("latest-publication").textContent = dateLabel(h.latest);
  $("health-label").textContent = h.title;
  $("health-note").textContent = h.note;
}
async function readJson(url, timeout = 12000, signal = null) {
  const res = await fetch(url, {
    cache: "no-cache",
    signal: signal ?? AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw Error("Feed not available");
  return res.json();
}
async function loadUpdates() {
  const id = ++loadId;
  controller?.abort();
  const requestController = new AbortController();
  controller = requestController;
  const timer = setTimeout(() => requestController.abort(), 12000);
  $("retry").hidden = true;
  $("load-message").hidden = false;
  $("load-message").className = "home-load-message";
  $("load-message").textContent = data
    ? "Refreshing the update list…"
    : "Loading the interactive feed. The page snapshot remains readable.";
  $("list").setAttribute("aria-busy", "true");
  try {
    const next = homepageData(
      await readJson("data/updates.json", 12000, requestController.signal),
    );
    if (id !== loadId) return;
    data = next;
    $("filter-controls").disabled = false;
    renderFilters();
    render();
    $("load-message").hidden = true;
    if (!cloudStarted) {
      cloudStarted = true;
      initCloud(ws, render).catch(() => {});
      loadCompanyNames();
    }
  } catch {
    if (id !== loadId) return;
    $("list").setAttribute("aria-busy", "false");
    $("retry").hidden = false;
    $("load-message").className = "home-load-message is-error";
    $("load-message").textContent = data
      ? "The latest feed could not be loaded. Your current list remains available. Retry or open the original publications."
      : "The interactive feed could not be loaded. Any page snapshot below is unfiltered; your selected filters have not been applied. Retry, read RSS, or browse the original publications.";
    if (!data) {
      $("filter-controls").disabled = true;
      $("snapshot-label").hidden = false;
      $("snapshot-label").textContent =
        "Unfiltered page snapshot · interactive filters are unavailable";
    }
  } finally {
    clearTimeout(timer);
  }
}
async function loadCompanyNames() {
  try {
    const rows = await readJson("data/companies/index.json", 6000);
    if (!Array.isArray(rows.companies)) return;
    coNames = new Map(rows.companies.map((c) => [c.id, c.name]));
    renderActive();
    render();
  } catch {}
}
async function loadCoverage() {
  try {
    const c = coverageSummary(await readJson("data/coverage.json", 6000));
    if (!c) return;
    $("hero-sources").textContent = coverageLine(c);
    const names = c.direct.length
      ? c.direct.join(" · ")
      : "See the source list for configured regulators";
    $("coverage-detail").textContent =
      `Direct official sources: ${names}. ${c.news} secondary news sources / searches broaden discovery. This lists configured coverage; availability and language gaps vary.`;
  } catch {}
}
function wire() {
  const cancelSearch = () => clearTimeout(searchTimer);
  $("q").addEventListener("input", (e) => {
    cancelSearch();
    const value = e.target.value.trim();
    searchTimer = setTimeout(() => set({ q: value }), 150);
  });
  $("country").addEventListener("change", (e) => {
    cancelSearch();
    set({ country: e.target.value, q: $("q").value.trim() });
  });
  $("topic").addEventListener("change", (e) => {
    cancelSearch();
    set({ cat: e.target.value, q: $("q").value.trim() });
  });
  $("days").addEventListener("change", (e) => set({ days: e.target.value }));
  $("mine").addEventListener("change", (e) =>
    set({ mine: e.target.checked ? "1" : "" }),
  );
  $("kind").addEventListener("click", (e) => {
    if (e.target.dataset && "v" in e.target.dataset)
      set({ kind: e.target.dataset.v });
  });
  $("reset").addEventListener("click", () => {
    cancelSearch();
    reset();
  });
  $("more").addEventListener("click", () => {
    shown += PAGE;
    render();
  });
  $("retry").addEventListener("click", loadUpdates);
  $("follow").addEventListener("click", () => {
    const a = store.get();
    store.set(
      a.includes(state.country)
        ? a.filter((c) => c !== state.country)
        : [...a, state.country],
    );
    renderFilters();
    if (state.mine) render();
  });
  for (const b of document.querySelectorAll("[data-example]"))
    b.addEventListener("click", () => {
      cancelSearch();
      set({ q: b.dataset.example });
    });
  window.addEventListener("popstate", () => {
    cancelSearch();
    readUrl();
    renderFilters();
    render();
  });
}
readUrl();
wire();
if (location.search)
  $("snapshot-label").textContent =
    "Unfiltered page snapshot · your URL filters will apply when the feed loads.";
loadUpdates();
loadCoverage();
watchAdmin({
  elements: [
    $("home-health"),
    ...document.querySelectorAll("[data-feed-admin]"),
  ],
  onHide: () => {
    admin = false;
    remoteStatus = null;
  },
  onAdmin: async (current) => {
    admin = true;
    renderHealth();
    try {
      const s = await readJson("data/status.json", 6000);
      if (!current()) return;
      remoteStatus = s;
      renderHealth();
    } catch {
      if (current()) renderHealth();
    }
  },
});
