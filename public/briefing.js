// My PV Briefing: a short daily view of the updates that matter to one reader,
// picked by their role, countries, topics and watchlist, each with an impact card.
// The profile and every save, follow, assessment, assignment and dismissal are
// kept in this browser (see workspace.js).

import { flag, ago, REGIONS } from "./lib.js";
import { ROLES, TOPICS, DATE_LABELS, buildBriefing } from "./impact.js";
import { el, impactSection, statusBadges } from "./impact-view.js";
import * as workspace from "./workspace.js";

const $ = (id) => document.getElementById(id);
const PAGE = 10;
const WINDOW_KEY = "pv-brief-window";

const ws = workspace.load();
// The previous visit decides "since my last visit"; this visit becomes the next one's.
const lastVisit = ws.lastVisit;
ws.lastVisit = new Date().toISOString();
workspace.save(ws);

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
const roleLabel = (id) => ROLES.find((r) => r.id === id)?.label;
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
    box.replaceChildren(on ? impactSection(u, { ws, countryName, onChange: changed }) : "");
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
  const role = ROLES.find((r) => r.id === p.role);
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

  $("sec-watch").hidden = !b.watch.length;
  $("watch").replaceChildren(...b.watch.map((x, i) => briefCard(x.u, { why: reasons(x), open: i === 0 })));

  $("sec-follow").hidden = !b.followUps.length;
  $("follow").replaceChildren(...b.followUps.map((x) => briefCard(x.u, { why: [`mentions ${x.about.join(", ")}, which you follow`] })));

  $("review-title").textContent = b.review.length ? `To review (${b.review.length})` : "To review";
  $("review").replaceChildren(
    ...b.review.slice(0, shown).map((x, i) => briefCard(x.u, { why: reasons(x), open: i === 0 && !b.watch.length })),
    b.review.length
      ? ""
      : el("p", { class: "empty" }, b.counts.total ? "Everything new in your scope is assessed or in your watchlist above." : "Nothing new in your scope. ", windowSel === "24h" && !b.counts.total ? el("button", { type: "button", class: "link", onclick: () => setWindow("7d") }, "Show the last 7 days") : ""),
  );
  $("review-more").hidden = b.review.length <= shown;

  $("sec-dates").hidden = !b.upcoming.length;
  $("dates").replaceChildren(
    ...b.upcoming.map((d) =>
      el("li", {}, el("time", { datetime: d.date }, fmtDate(d.date)), el("span", { class: `dtype t-${d.type}` }, DATE_LABELS[d.type]), el("a", { href: d.update.link, target: "_blank", rel: "noopener" }, d.update.title), el("span", { class: "why" }, ` “${d.quote}”`)),
    ),
  );

  renderWork();
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
  $("pf-role").replaceChildren(el("option", { value: "" }, "Any role"), ...ROLES.map((r) => el("option", { value: r.id, selected: p.role === r.id }, r.label)));
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
      watch: [...new Set($("pf-watch").value.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean))],
    };
    ws.profileSet = true;
    workspace.save(ws);
    showProfile(false);
    render();
  });
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
  if (!ws.profileSet) {
    showProfile(true);
  }
  render();
  if (!ws.profileSet) $("lede").prepend("Pick your role, countries, topics and watchlist below to tailor this briefing; until then it shows everything. ");
}

main();
