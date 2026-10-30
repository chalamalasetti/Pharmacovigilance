// Archive: searches every update PV Info has ever collected (the database keeps
// them after they leave the 60-day feed), by words, country, topic, source type
// and dates. Each result opens into its impact card. No sign-in needed.

import { flag, ago } from "./lib.js";
import { el, impactSection, statusBadges } from "./impact-view.js";
import * as workspace from "./workspace.js";
import * as cloud from "./cloud.js";

const $ = (id) => document.getElementById(id);
const PAGE = 50;
const ws = workspace.load();
let data = { countries: [], categories: [] };
let shown = [];
let total = 0;

const countryName = (code) => data.countries.find((c) => c.code === code)?.country ?? code;
const catLabel = (id) => data.categories.find((c) => c.id === id)?.label ?? id;
const fields = ["q", "country", "cat", "kind", "from", "to"];
const filters = () => Object.fromEntries(fields.map((f) => [f, $(f).value]));

function card(u) {
  const when = u.published ? new Date(u.published) : null;
  const badges = el("span", { class: "ws-badges" }, statusBadges(workspace.item(ws, u.id)));
  const box = el("div", { class: "impact-box" });
  const toggle = el("button", { type: "button", class: "imp-toggle", "aria-expanded": "false" }, "Impact card ▾");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide impact card ▴" : "Impact card ▾";
    box.replaceChildren(open ? impactSection(u, { ws, countryName, onChange: () => badges.replaceChildren(...statusBadges(workspace.item(ws, u.id))) }) : "");
  });
  return el(
    "article",
    { class: `card c-${u.category}${u.kind === "official" ? " official" : ""}` },
    el("div", { class: "meta" },
      el("span", { class: "tag" }, catLabel(u.category)),
      el("span", { class: "where" }, `${flag(u.country)} ${countryName(u.country)}`),
      u.kind === "official" ? el("span", { class: "badge" }, "Official") : null,
      badges,
    ),
    el("h3", {}, el("a", { href: u.link, target: "_blank", rel: "noopener" }, u.title)),
    el("div", { class: "src" }, el("span", {}, u.agency && !u.source?.includes(u.agency) ? `${u.source} · ${u.agency}` : u.source), when ? el("time", { datetime: u.published, title: when.toLocaleString() }, when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })) : null),
    toggle,
    box,
  );
}

async function search(more = false) {
  const f = filters();
  if (!more) {
    shown = [];
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    history.replaceState(null, "", q.size ? `?${q}` : location.pathname);
  }
  $("count").textContent = "Searching…";
  try {
    const r = await cloud.searchArchive({ ...f, offset: shown.length, limit: PAGE });
    shown.push(...r.updates);
    total = r.count ?? shown.length;
  } catch (e) {
    $("count").textContent = `Search failed: ${e.message}`;
    return;
  }
  $("count").textContent = total ? `${total.toLocaleString()} update${total === 1 ? "" : "s"}${total > shown.length ? `, showing ${shown.length}` : ""}` : "No updates match.";
  $("list").replaceChildren(...shown.map(card));
  $("more").hidden = shown.length >= total;
}

async function main() {
  if (!(await cloud.client())) {
    $("lede").textContent = "The archive needs the site's database, which isn't connected yet. Updates from the last 60 days are on the Updates page.";
    return;
  }
  cloud.navOnly();
  try {
    const res = await fetch("data/updates.json", { cache: "no-cache" });
    if (res.ok) data = await res.json();
  } catch {}
  $("country").append(...[...data.countries].sort((a, b) => a.country.localeCompare(b.country)).map((c) => el("option", { value: c.code }, `${flag(c.code)} ${c.country}`)));
  $("cat").append(...data.categories.map((c) => el("option", { value: c.id }, c.label)));
  const asked = new URLSearchParams(location.search);
  for (const f of fields) if (asked.get(f)) $(f).value = asked.get(f);

  const stats = await cloud.archiveStats().catch(() => null);
  $("lede").textContent = stats?.count
    ? `${stats.count.toLocaleString()} updates kept since ${stats.since ? new Date(stats.since).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "the archive started"}, each with its impact card. ${stats.since ? `Oldest: ${ago(new Date(stats.since))}.` : ""}`
    : "The archive is empty so far. It fills from the next hourly refresh.";
  $("form").hidden = false;
  $("form").addEventListener("submit", (e) => (e.preventDefault(), search()));
  $("form").addEventListener("reset", () => setTimeout(() => search(), 0));
  $("more").addEventListener("click", () => search(true));
  search();
}

main();
