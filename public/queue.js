// Team queue: the active team's shared review queue (what teammates assessed,
// assigned or dismissed, by tab), each update with its impact card, and the audit
// trail of every change. Needs sign-in and a team; see account.html.

import { flag, ago } from "./lib.js";
import { el, impactSection } from "./impact-view.js";
import * as workspace from "./workspace.js";
import * as cloud from "./cloud.js";

const $ = (id) => document.getElementById(id);
const ws = workspace.load();
let data = null;
let tab = "mine";

const countryName = (code) => data?.countries.find((c) => c.code === code)?.country ?? code;
const catLabel = (id) => data?.categories.find((c) => c.id === id)?.label ?? id;
// The live copy of an update when it is still in the 60-day feed, else the queue's copy.
const updateFor = (t) => data?.updates.find((u) => u.id === t.update_id) ?? t.snapshot;

const VERB = { assessed: "assessed", unassessed: "cleared the assessment of", assigned: "assigned", unassigned: "unassigned", dismissed: "dismissed", restored: "restored" };

function queueCard(t) {
  const u = updateFor(t);
  const when = u.published ? new Date(u.published) : null;
  const box = el("div", { class: "impact-box" });
  const line = el("p", { class: "team-line" });
  const drawLine = () => {
    const now = cloud.team.items.get(t.update_id) ?? t;
    line.replaceChildren(
      cloud.isOverdue(now) ? el("span", { class: "ws-badge overdue" }, "Overdue") : null,
      cloud.teamSummary(now),
      el("span", { class: "why" }, ` · last change by ${cloud.memberName(now.updated_by)} ${ago(new Date(now.updated_at))}`),
    );
  };
  const toggle = el("button", { type: "button", class: "imp-toggle", "aria-expanded": "false" }, "Impact card ▾");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide impact card ▴" : "Impact card ▾";
    box.replaceChildren(open ? impactSection(u, { ws, countryName }) : "");
  });
  cloud.onTeam(drawLine);
  drawLine();
  return el(
    "article",
    { class: `card c-${u.category}${u.kind === "official" ? " official" : ""}${t.dismissed ? " dismissed" : ""}` },
    el("div", { class: "meta" },
      u.category ? el("span", { class: "tag" }, catLabel(u.category)) : null,
      u.country ? el("span", { class: "where" }, `${flag(u.country)} ${countryName(u.country)}`) : null,
      u.kind === "official" ? el("span", { class: "badge" }, "Official") : null,
    ),
    el("h3", {}, el("a", { href: u.link, target: "_blank", rel: "noopener" }, u.title)),
    line,
    el("div", { class: "src" }, el("span", {}, u.source ?? ""), when ? el("time", { datetime: u.published, title: when.toLocaleString() }, ago(when)) : null),
    toggle,
    box,
  );
}

function renderCounts() {
  const items = [...cloud.team.items.values()];
  const me = cloud.team.me?.id;
  const n = (id) => items.filter((t) => cloud.QUEUE_TABS.find((x) => x.id === id).test(t, me)).length;
  const overdue = items.filter((t) => cloud.isOverdue(t)).length;
  $("tiles").replaceChildren(
    el("div", { class: "tile hot" }, el("b", {}, String(n("mine"))), el("span", {}, "assigned to you")),
    el("div", { class: "tile safety" }, el("b", {}, String(n("action"))), el("span", {}, "need action")),
    el("div", { class: "tile" }, el("b", {}, String(n("open"))), el("span", {}, "open in the queue")),
    el("div", { class: `tile${overdue ? " safety" : ""}` }, el("b", {}, String(overdue)), el("span", {}, "overdue")),
  );
  $("tabs").replaceChildren(
    ...cloud.QUEUE_TABS.map((x) => el("button", { type: "button", role: "tab", "aria-pressed": String(tab === x.id), onclick: () => ((tab = x.id), renderCounts(), renderQueue()) }, `${x.label} (${n(x.id)})`)),
  );
}

function renderQueue() {
  const me = cloud.team.me?.id;
  const t = cloud.QUEUE_TABS.find((x) => x.id === tab);
  const list = [...cloud.team.items.values()]
    .filter((x) => t.test(x, me))
    // Due dates first (soonest on top), then the most recently touched.
    .sort((a, b) => (a.assign?.due ?? "9999").localeCompare(b.assign?.due ?? "9999") || b.updated_at.localeCompare(a.updated_at));
  $("queue").replaceChildren(
    ...(list.length ? list.map(queueCard) : [el("p", { class: "empty" }, tab === "mine" ? "Nothing assigned to you. Assign from any impact card on Updates or My Briefing." : `Nothing ${t.label.toLowerCase()} right now.`)]),
  );
}

async function renderLog() {
  const events = await cloud.teamEvents(60);
  $("log-sec").hidden = !events.length;
  $("log").replaceChildren(
    ...events.map((e) => {
      const d = e.detail ?? {};
      const extra = e.action === "assessed" ? (d.status ? `: ${{ open: "under assessment", action: "action needed", noaction: "no action", notrelevant: "not relevant" }[d.status] ?? d.status}` : "")
        : e.action === "assigned" ? ` to ${d.to}${d.due ? `, due ${d.due}` : ""}`
        : e.action === "dismissed" ? `: ${d.reason}` : "";
      return el("li", {},
        el("time", { datetime: e.at, title: new Date(e.at).toLocaleString() }, ago(new Date(e.at))),
        el("span", {}, el("b", {}, cloud.memberName(e.user_id)), ` ${VERB[e.action] ?? e.action} “${d.title ?? e.update_id}”${extra}`),
      );
    }),
  );
}

async function main() {
  if (!(await cloud.client())) {
    $("lede").textContent = "Team queues need the site's database, which isn't connected yet. Your own work is under My Briefing → My work.";
    return;
  }
  try {
    const res = await fetch("data/updates.json", { cache: "no-cache" });
    if (res.ok) data = await res.json();
  } catch {}
  const user = await cloud.initCloud(ws);
  if (!user) {
    $("lede").replaceChildren("Sign in to see your team's queue. ", el("a", { href: "account.html" }, "Sign in →"));
    return;
  }
  if (!cloud.team.id) {
    $("lede").replaceChildren("You're not in a team yet. ", el("a", { href: "account.html" }, "Create or join one →"));
    return;
  }
  $("title").textContent = `${cloud.team.name} queue`;
  $("lede").textContent = `${cloud.team.members.length} member${cloud.team.members.length === 1 ? "" : "s"}. Assessments, assignments and dismissals from any impact card land here for the whole team.`;
  if (!cloud.assignedToMe().length) tab = "open";
  $("queue-sec").hidden = false;
  cloud.onTeam(renderCounts);
  renderCounts();
  renderQueue();
  renderLog().catch((e) => console.warn(e));
}

main();
