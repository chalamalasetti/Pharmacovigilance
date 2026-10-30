// My PV Briefing: a short daily view of the updates that matter to one reader,
// picked by their view (audience), countries, topics and watchlist, each with an
// impact card. Each view leads with its own sections (views.js); readers switch
// views at any time, rename them and add their own groups.
// The profile and every save, follow, assessment, assignment and dismissal are
// kept in this browser (see workspace.js) and, once signed in, synced (cloud.js).

import { flag, ago, REGIONS } from "./lib.js";
import { TOPICS, DATE_LABELS, buildBriefing, groups, findGroup, ROLES, LEGACY_ROLES } from "./impact.js";
import { VIEW_LIMIT, viewSections, pendingWork, coverageGaps } from "./views.js";
import { el, impactSection, statusBadges } from "./impact-view.js";
import * as workspace from "./workspace.js";
import { initCloud } from "./cloud.js";

const $ = (id) => document.getElementById(id);
const PAGE = 10;
const WINDOW_KEY = "pv-brief-window";

const ws = workspace.load();
// The previous visit decides "since my last visit"; this visit becomes the next one's.
const lastVisit = ws.lastVisit;
ws.lastVisit = new Date().toISOString();
// Not a change worth syncing: each device keeps its own last visit.
workspace.persist(ws);

let data = null;
let shown = PAGE;
let tab = "saved";
let windowSel = (() => {
  try {
    return localStorage.getItem(WINDOW_KEY) || "24h";
  } catch {
    return "24h";
  }
})();

const countryName = (code) => data?.countries.find((c) => c.code === code)?.country ?? code;
const catLabel = (id) => data?.categories.find((c) => c.id === id)?.label ?? id;
const roleLabel = (id) => findGroup(id, ws.groups)?.label;
const currentGroup = () => findGroup(ws.profile.role, ws.groups);
const fmtDate = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function briefCard(u, { why = [], open = false } = {}) {
  const when = u.published ? new Date(u.published) : null;
  const rec = workspace.item(ws, u.id);
  const badges = el("span", { class: "ws-badges" }, statusBadges(rec));
  const box = el("div", { class: "impact-box" });
  const toggle = el("button", { type: "button", class: "imp-toggle", "aria-expanded": "false" });
  const set = (on) => {
    toggle.setAttribute("aria-expanded", String(on));
    toggle.textContent = on ? "Hide impact card ▴" : "Impact card ▾";
    box.replaceChildren(on ? impactSection(u, { ws, countryName, onChange: changed, technicalFirst: Boolean(currentGroup()?.technical) }) : "");
  };
  const changed = () => {
    badges.replaceChildren(...statusBadges(workspace.item(ws, u.id)));
    clearTimeout(changed.t);
    // Let the reader finish with the card before it moves to "My work".
    changed.t = setTimeout(() => renderWork(), 50);
  };
  toggle.addEventListener("click", () => set(toggle.getAttribute("aria-expanded") !== "true"));
  set(open);
  return el(
    "article",
    { class: `card c-${u.category}${u.kind === "official" ? " official" : ""}` },
    el(
      "div",
      { class: "meta" },
      el("span", { class: "tag" }, catLabel(u.category)),
      el("span", { class: "where" }, `${flag(u.country)} ${countryName(u.country)}`),
      u.kind === "official" ? el("span", { class: "badge" }, "Official") : null,
      badges,
    ),
    el("h3", {}, el("a", { href: u.link, target: "_blank", rel: "noopener" }, u.title)),
    why.length ? el("p", { class: "whyhere" }, "Why it's here: ", why.join(" · ")) : null,
    el("div", { class: "src" }, el("span", {}, u.agency && !u.source.includes(u.agency) ? `${u.source} · ${u.agency}` : u.source), when ? el("time", { datetime: u.published, title: when.toLocaleString() }, ago(when)) : null),
    toggle,
    box,
  );
}

function reasons(x) {
  const p = ws.profile;
  const out = [];
  if (x.hits.length) out.push(`watchlist: ${x.hits.join(", ")}`);
  if (p.countries.includes(x.u.country)) out.push(`your country (${countryName(x.u.country)})`);
  else if (x.u.country === "INT") out.push("international body");
  const role = currentGroup();
  const roleTopic = role && x.u.tags.find((t) => role.topics[t] >= 2);
  if (roleTopic) out.push(`${catLabel(roleTopic).toLowerCase()} matters for ${role.label}`);
  if (role?.technical && x.card.technical.length) out.push("has potential technical impact");
  if (x.u.kind === "official") out.push("official notice");
  return out;
}

function render() {
  const b = buildBriefing(data.updates, ws, { window: windowSel, lastVisit, countryName });
  const p = ws.profile;
  const windowText = { "24h": "in the last 24 hours", "7d": "in the last 7 days", "30d": "in the last 30 days", visit: lastVisit ? `since your last visit (${ago(new Date(lastVisit))})` : "in the last 24 hours" }[windowSel];
  const scope = [roleLabel(p.role), p.countries.length ? p.countries.map((c) => `${flag(c)} ${countryName(c)}`).join(", ") : "all countries", p.topics.length ? p.topics.map(catLabel).join(", ") : "all topics"].filter(Boolean).join(" · ");
  $("lede").replaceChildren(
    `${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}. `,
    b.counts.total ? `${b.counts.total} update${b.counts.total === 1 ? "" : "s"} for you ${windowText}.` : `Nothing new for you ${windowText}.`,
    el("br"),
    el("span", { class: "scope" }, scope, p.watch.length ? ` · watching ${p.watch.join(", ")}` : ""),
  );

  const tile = (n, label, cls = "") => el("div", { class: `tile ${cls}` }, el("b", {}, String(n)), el("span", {}, label));
  $("tiles").replaceChildren(
    tile(b.counts.total, "new for you"),
    tile(b.watch.length, "watchlist hits", b.watch.length ? "hot" : ""),
    tile(b.counts.safety, "safety & recalls", b.counts.safety ? "safety" : ""),
    tile(b.counts.regulatory, "regulatory & guidance"),
    tile(b.counts.unassessed, "not yet assessed"),
    tile(b.upcoming.length, "dates coming up"),
  );

  renderViews();
  const group = currentGroup();
  const { sections, rest } = group ? viewSections(group.base, b) : { sections: [{ id: "watch", title: "Watchlist hits", items: b.watch }], rest: b.review };
  $("sections").replaceChildren(...sections.map((sec, i) => renderSection(sec, b, i === 0)));

  $("sec-follow").hidden = !b.followUps.length;
  $("follow").replaceChildren(...b.followUps.map((x) => briefCard(x.u, { why: [`mentions ${x.about.join(", ")}, which you follow`] })));

  const queue = rest.filter((x) => !ws.items[x.u.id]?.assess);
  $("review-title").textContent = queue.length ? `More in your scope (${queue.length})` : "More in your scope";
  $("review").replaceChildren(
    ...queue.slice(0, shown).map((x) => briefCard(x.u, { why: reasons(x) })),
    queue.length
      ? ""
      : el("p", { class: "empty" }, b.counts.total ? "Everything new in your scope is in the sections above or already assessed." : "Nothing new in your scope. ", windowSel === "24h" && !b.counts.total ? el("button", { type: "button", class: "link", onclick: () => setWindow("7d") }, "Show the last 7 days") : ""),
  );
  $("review-more").hidden = queue.length <= shown;

  // QPPV-style views show dates as a section of their own.
  $("sec-dates").hidden = !b.upcoming.length || sections.some((x) => x.kind === "dates");
  $("dates").replaceChildren(
    ...b.upcoming.map((d) =>
      el("li", {}, el("time", { datetime: d.date }, fmtDate(d.date)), el("span", { class: `dtype t-${d.type}` }, DATE_LABELS[d.type]), el("a", { href: d.update.link, target: "_blank", rel: "noopener" }, d.update.title), el("span", { class: "why" }, ` “${d.quote}”`)),
    ),
  );

  renderWork();
}

const upcomingList = (list) =>
  el("ul", { class: "upcoming" }, list.map((d) =>
    el("li", {}, el("time", { datetime: d.date }, fmtDate(d.date)), el("span", { class: `dtype t-${d.type}` }, DATE_LABELS[d.type]), el("a", { href: d.update.link, target: "_blank", rel: "noopener" }, d.update.title), el("span", { class: "why" }, ` “${d.quote}”`)),
  ));

const updateOrSnapshot = (id) => data.updates.find((u) => u.id === id) ?? ws.items[id]?.snapshot;

// One section of a view: a list of updates, or one of the summaries (dates, review status, glance, pending, gaps).
function renderSection(sec, b, first) {
  const body = [];
  const empty = (t) => el("p", { class: "empty small" }, t);
  if (!sec.kind) {
    const limit = sec.limit ?? VIEW_LIMIT;
    const cards = sec.items.map((x, i) => briefCard(x.u, { why: reasons(x), open: first && i === 0 }));
    body.push(...cards.slice(0, limit));
    if (cards.length > limit) {
      const more = el("button", { type: "button", class: "link", onclick: () => (more.replaceWith(...cards.slice(limit))) }, `Show all ${cards.length}`);
      body.push(more);
    }
    if (!cards.length) body.push(empty("Nothing in this window."));
  } else if (sec.kind === "dates") {
    const ds = b.upcoming.filter((d) => ["effective", "consultation", "transition"].includes(d.type));
    body.push(ds.length ? upcomingList(ds) : empty("No future effective dates, consultation deadlines or transition periods stated in updates in your scope."));
  } else if (sec.kind === "status" || sec.kind === "pending") {
    const pw = pendingWork(ws.items, b.all);
    if (sec.kind === "status") {
      const labels = Object.fromEntries(workspace.ASSESSMENT.map((a) => [a.id, a.label]));
      body.push(el("div", { class: "statusrow" },
        el("span", {}, el("b", {}, String(b.counts.unassessed)), " new in scope not yet assessed"),
        ...workspace.ASSESSMENT.map((a) => el("span", { class: `ws-badge a-${a.id}` }, `${labels[a.id]}: ${pw.byStatus[a.id] ?? 0}`)),
      ));
    } else {
      body.push(el("p", { class: "small" }, el("b", {}, String(pw.unassessedHigh.length)), ` high-priority update${pw.unassessedHigh.length === 1 ? "" : "s"} in scope not yet assessed · `, el("b", {}, String(pw.open.length)), " open assessments or assignments"));
      const cards = pw.open.map((x) => updateOrSnapshot(x.id)).filter(Boolean).map((u) => briefCard(u));
      body.push(...(cards.length ? cards.slice(0, VIEW_LIMIT) : [empty("No assessments under way or assigned.")]));
    }
  } else if (sec.kind === "glance") {
    const byCat = data.categories.map((c) => ({ ...c, items: b.all.filter((x) => x.u.category === c.id) })).filter((c) => c.items.length);
    body.push(byCat.length
      ? el("ul", { class: "glance" }, byCat.map((c) => {
          const top = c.items[0].u;
          return el("li", { class: `c-${c.id}` }, el("span", { class: "dot" }), el("b", {}, `${c.items.length} ${c.label.toLowerCase()}`), " · top: ", el("a", { href: top.link, target: "_blank", rel: "noopener" }, top.title));
        }))
      : empty("No updates in scope in this window."));
  } else if (sec.kind === "gaps") {
    const g = coverageGaps(data.updates, { countries: data.countries, profileCountries: ws.profile.countries, since: Date.parse(b.since), feeds: data.feeds });
    const names = (cs) => cs.map((c) => `${flag(c.code)} ${c.country}`).join(", ");
    body.push(el("ul", { class: "gaps" },
      el("li", {}, el("b", {}, `No updates in this window (${g.none.length}): `), g.none.length ? names(g.none) : "none"),
      el("li", {}, el("b", {}, `News coverage only, no official notice (${g.newsOnly.length}): `), g.newsOnly.length ? names(g.newsOnly) : "none"),
      el("li", {}, el("b", {}, "Sources unreachable on the last refresh: "), `${g.failedFeeds} of ${g.totalFeeds}`),
    ));
    body.push(el("p", { class: "hint" }, "Gaps in what PV Info collected, not in what regulators published. Check these regulators' sites directly."));
  }
  return el("section", { class: "brief-sec" }, el("h2", {}, sec.title, sec.items?.length ? el("span", { class: "n" }, ` ${sec.items.length}`) : ""), sec.hint ? el("p", { class: "hint" }, sec.hint) : null, ...body);
}

function renderViews() {
  const all = groups(ws.groups);
  const cur = currentGroup()?.id ?? "";
  $("views").replaceChildren(
    el("span", { class: "label" }, "View"),
    ...all.map((g) => el("button", { type: "button", class: "chip", "aria-pressed": String(cur === g.id), title: g.blurb, onclick: () => setView(g.id) }, g.label)),
    el("button", { type: "button", class: "chip", "aria-pressed": String(!cur), onclick: () => setView("") }, "Everything"),
  );
}

// The leaders' view reads a week at a time; leaving it goes back to a day.
function setView(id) {
  const before = currentGroup();
  ws.profile.role = id;
  workspace.save(ws);
  const p = new URLSearchParams(location.search);
  if (id) p.set("view", id);
  else p.delete("view");
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
  shown = PAGE;
  const g = currentGroup();
  setWindow(g?.window ?? (before?.window && windowSel === before.window ? "24h" : windowSel));
}

// First visit: pick a view, then interests. Two short steps instead of the full profile form.
function startSetup() {
  $("setup").hidden = false;
  $("setup-1").hidden = false;
  $("setup-2").hidden = true;
  $("setup-step").textContent = "Step 1 of 2";
  $("setup-roles").replaceChildren(
    ...groups(ws.groups).map((g) =>
      el("button", { type: "button", class: "role-card", onclick: () => setupStep2(g) }, el("b", {}, g.label), el("span", {}, g.blurb)),
    ),
  );
}

function setupStep2(g) {
  ws.profile.role = g.id;
  $("setup-1").hidden = true;
  $("setup-2").hidden = false;
  $("setup-step").textContent = `Step 2 of 2 · ${g.label}`;
  // Topics narrow the briefing hard, so none are ticked: the view already ranks its topics first.
  const picked = ws.profile.topics;
  $("setup-topics").replaceChildren(
    ...TOPICS.map((t) => el("label", { class: `pf-check c-${t}` }, el("input", { type: "checkbox", name: "s-topic", value: t, checked: picked.includes(t) }), el("span", { class: "dot" }), catLabel(t))),
  );
  const common = ["US", "EU", "GB", "JP", "CN", "IN", "CA", "AU", "CH", "BR", "KR"];
  $("setup-countries").replaceChildren(
    ...data.countries.filter((c) => common.includes(c.code)).map((c) => el("label", { class: "pf-check" }, el("input", { type: "checkbox", name: "s-country", value: c.code, checked: ws.profile.countries.includes(c.code) }), `${flag(c.code)} ${c.country}`)),
  );
  $("setup-watch").value = ws.profile.watch.join(", ");
}

function finishSetup(skip = false) {
  if (!skip) {
    const ticked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    ws.profile.topics = ticked("s-topic");
    ws.profile.countries = ticked("s-country");
    ws.profile.watch = splitList($("setup-watch").value);
  } else ws.profile.role = "";
  ws.profileSet = true;
  workspace.save(ws);
  $("setup").hidden = true;
  setView(ws.profile.role);
}

const splitList = (v) => [...new Set(v.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean))];

// Rename the five views, and add, rename or remove custom groups.
function groupRow(g, settings) {
    const isCustom = g.custom;
    return el("div", { class: "group-row", "data-id": g.id, "data-custom": isCustom ? "1" : "" },
      el("input", { type: "text", class: "g-name", value: g.label, "aria-label": "Group name", placeholder: g.defaultLabel ?? "Group name" }),
      isCustom
        ? [
            el("label", {}, "Based on ", el("select", { class: "g-base" }, ROLES.map((r) => el("option", { value: r.id, selected: g.base === r.id }, settings.names?.[r.id] || r.label)))),
            el("input", { type: "text", class: "g-words", value: (settings.custom.find((c) => c.id === g.id)?.words ?? []).join(", "), placeholder: "Extra keywords, comma separated", "aria-label": "Keywords" }),
            el("div", { class: "pf-checks" }, el("span", { class: "hint" }, "Rank these topics higher:"), TOPICS.map((t) => el("label", { class: "pf-check" }, el("input", { type: "checkbox", class: "g-topic", value: t, checked: (settings.custom.find((c) => c.id === g.id)?.topics ?? []).includes(t) }), catLabel(t)))),
            el("button", { type: "button", onclick: (e) => e.target.closest(".group-row").remove() }, "Remove"),
          ]
        : el("span", { class: "hint" }, g.blurb),
    );
}

function renderGroups() {
  const settings = ws.groups ?? { names: {}, custom: [] };
  $("groups-list").replaceChildren(...groups(settings).map((g) => groupRow(g, settings)));
}

function showGroups(on) {
  $("groups").hidden = !on;
  if (on) {
    renderGroups();
    $("groups").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function saveGroups() {
  const names = {};
  const custom = [];
  for (const r of $("groups-list").querySelectorAll(".group-row")) {
    const id = r.dataset.id;
    const name = r.querySelector(".g-name").value.trim();
    if (!r.dataset.custom) {
      const def = ROLES.find((x) => x.id === id)?.label;
      if (name && name !== def) names[id] = name;
    } else {
      custom.push({
        id,
        name: name || "My group",
        base: r.querySelector(".g-base").value,
        words: splitList(r.querySelector(".g-words").value),
        topics: [...r.querySelectorAll(".g-topic:checked")].map((i) => i.value),
      });
    }
  }
  ws.groups = { names, custom };
  if (ws.profile.role && !findGroup(ws.profile.role, ws.groups)) ws.profile.role = "";
  workspace.save(ws);
  showGroups(false);
  render();
}


const WORK_TABS = [
  { id: "saved", label: "Saved", test: (r) => r.saved },
  { id: "followed", label: "Following", test: (r) => r.followed },
  { id: "assigned", label: "Assigned", test: (r) => r.assign },
  { id: "assessed", label: "Assessed", test: (r) => r.assess },
  { id: "dismissed", label: "Dismissed", test: (r) => r.dismissed },
];

function renderWork() {
  const byId = new Map(data.updates.map((u) => [u.id, u]));
  const entries = Object.entries(ws.items);
  $("worktabs").replaceChildren(
    ...WORK_TABS.map((t) => {
      const n = entries.filter(([, r]) => t.test(r)).length;
      return el("button", { type: "button", role: "tab", "aria-pressed": String(tab === t.id), onclick: () => ((tab = t.id), renderWork()) }, `${t.label} (${n})`);
    }),
  );
  const t = WORK_TABS.find((x) => x.id === tab);
  const list = entries
    .filter(([, r]) => t.test(r))
    .map(([id, r]) => byId.get(id) ?? r.snapshot)
    .filter(Boolean)
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  $("work").replaceChildren(...(list.length ? list.map((u) => briefCard(u)) : [el("p", { class: "empty" }, `Nothing ${t.label.toLowerCase()} yet. Use the buttons on any impact card.`)]));
}

function setWindow(v) {
  windowSel = v;
  $("window").value = v;
  try {
    localStorage.setItem(WINDOW_KEY, v);
  } catch {}
  shown = PAGE;
  render();
}

function renderProfile() {
  const p = ws.profile;
  $("pf-role").replaceChildren(el("option", { value: "" }, "Everything"), ...groups(ws.groups).map((r) => el("option", { value: r.id, selected: currentGroup()?.id === r.id }, r.label)));
  $("pf-watch").value = p.watch.join(", ");
  $("pf-topics").replaceChildren(
    ...TOPICS.map((t) => el("label", { class: `pf-check c-${t}` }, el("input", { type: "checkbox", name: "topic", value: t, checked: p.topics.includes(t) }), el("span", { class: "dot" }), catLabel(t))),
  );
  $("pf-countries").replaceChildren(
    ...REGIONS.map((r) =>
      el("fieldset", { class: "pf-region" }, el("legend", {}, r), el("div", { class: "pf-checks" },
        data.countries.filter((c) => c.region === r).map((c) => el("label", { class: "pf-check" }, el("input", { type: "checkbox", name: "country", value: c.code, checked: p.countries.includes(c.code) }), `${flag(c.code)} ${c.country}`)),
      )),
    ),
  );
}

function showProfile(on) {
  $("profile").hidden = !on;
  $("edit").textContent = on ? "Close profile" : "Edit profile";
  if (on) {
    renderProfile();
    $("profile").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function download(name, text, type) {
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
}

function wire() {
  $("window").value = windowSel;
  $("window").addEventListener("change", (e) => setWindow(e.target.value));
  $("edit").addEventListener("click", () => showProfile($("profile").hidden));
  $("pf-cancel").addEventListener("click", () => showProfile(false));
  $("profile-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const ticked = (name) => [...f.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    ws.profile = {
      role: $("pf-role").value,
      countries: ticked("country"),
      topics: ticked("topic"),
      watch: splitList($("pf-watch").value),
    };
    ws.profileSet = true;
    workspace.save(ws);
    showProfile(false);
    render();
  });
  $("edit-groups").addEventListener("click", () => showGroups($("groups").hidden));
  $("groups-cancel").addEventListener("click", () => showGroups(false));
  $("groups-form").addEventListener("submit", (e) => (e.preventDefault(), saveGroups()));
  $("group-add").addEventListener("click", () => {
    const row = groupRow({ id: `g${Date.now().toString(36)}`, custom: true, label: "", base: "ops", defaultLabel: "Name your group" }, ws.groups ?? { names: {}, custom: [] });
    $("groups-list").append(row);
    row.querySelector(".g-name").focus();
  });
  $("setup-skip").addEventListener("click", () => finishSetup(true));
  $("setup-back").addEventListener("click", startSetup);
  $("setup-done").addEventListener("click", () => finishSetup());
  $("review-more").addEventListener("click", () => {
    shown += PAGE;
    render();
  });
  const stamp = new Date().toISOString().slice(0, 10);
  $("export").addEventListener("click", () => download(`pv-info-workspace-${stamp}.json`, workspace.exportJson(ws), "application/json"));
  $("csv").addEventListener("click", () => download(`pv-info-assessments-${stamp}.csv`, workspace.exportCsv(ws, data.updates), "text/csv"));
  $("import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      workspace.importJson(ws, await file.text());
      $("data-msg").textContent = `Imported ${file.name}.`;
      renderProfile();
      render();
    } catch (err) {
      $("data-msg").textContent = `Couldn't import ${file.name}: ${err.message}`;
    }
    e.target.value = "";
  });
}

async function main() {
  wire();
  try {
    const res = await fetch("data/updates.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    $("lede").textContent = "The update list hasn't been built yet.";
    return;
  }
  // A shared link can open a given view: briefing.html?view=systems
  const asked = new URLSearchParams(location.search).get("view");
  if (asked && findGroup(asked, ws.groups)) ws.profile.role = findGroup(asked, ws.groups).id;
  else if (ws.profile.role in LEGACY_ROLES) ws.profile.role = findGroup(ws.profile.role, ws.groups)?.id ?? "";
  render();
  if (!ws.profileSet && !asked) startSetup();
  // Signed in: bring in the synced profile and actions, and the team queue.
  initCloud(ws, () => {
    if (ws.profileSet) $("setup").hidden = true;
    renderViews();
    render();
  });
}

main();
