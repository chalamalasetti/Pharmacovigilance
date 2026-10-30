// Account and team page: email sign-in, sync status, display name, and creating,
// joining, switching and leaving teams. An invite link (account.html?join=CODE)
// offers to join that team, after sign-in if needed.

import * as workspace from "./workspace.js";
import { el } from "./impact-view.js";
import * as cloud from "./cloud.js";

const $ = (id) => document.getElementById(id);
const PENDING = "pv-join";
const ws = workspace.load();

const busy = async (msgEl, fn) => {
  msgEl.textContent = "Working…";
  try {
    await fn();
    if (msgEl.textContent === "Working…") msgEl.textContent = "";
  } catch (e) {
    msgEl.textContent = e.message || String(e);
  }
};

const joinCode = () => {
  const asked = new URLSearchParams(location.search).get("join");
  try {
    if (asked) sessionStorage.setItem(PENDING, asked);
    return asked || sessionStorage.getItem(PENDING);
  } catch {
    return asked;
  }
};
const clearJoin = () => {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {}
  history.replaceState(null, "", "account.html");
};

function renderSync(s) {
  const at = s.at ? s.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  $("sync-msg").textContent = {
    syncing: "Syncing your briefing profile, groups and actions…",
    synced: `Your briefing profile, groups and actions are synced across your devices (last synced ${at}).`,
    error: `Couldn't sync just now: ${s.error?.message ?? "unknown error"}. Your changes are safe in this browser and will sync next time.`,
    off: "",
  }[s.state];
}

function renderTeams() {
  const t = cloud.team;
  const code = joinCode();
  const already = t.list.find((x) => x.code === code);
  $("invited").hidden = !code || Boolean(already);
  if (code && !already) {
    $("invited").replaceChildren(
      el("p", {}, el("b", {}, "You've been invited to a team. "), "Join it to share its review queue."),
      el("div", { class: "row" },
        el("button", { type: "button", class: "primary", onclick: () => busy($("team-msg"), async () => (await cloud.joinTeam(ws, code), clearJoin(), renderTeams())) }, "Join the team"),
        el("button", { type: "button", onclick: () => (clearJoin(), renderTeams()) }, "Not now"),
      ),
    );
  } else if (already) clearJoin();

  $("team-list").replaceChildren(
    ...[t.list.length > 1
      ? el("div", { class: "row" }, el("span", { class: "label" }, "Active team"),
          ...t.list.map((x) => el("button", { type: "button", class: "chip", "aria-pressed": String(x.id === t.id), onclick: () => busy($("team-msg"), async () => (await cloud.setActiveTeam(ws, x.id), renderTeams())) }, x.name)))
      : t.list.length ? null : el("p", { class: "empty small" }, "You're not in a team yet. Create one and invite colleagues, or join with an invite code.")].filter(Boolean),
  );

  if (!t.id) return $("team-detail").replaceChildren();
  const owner = t.role === "owner";
  const link = cloud.inviteLink(t.code);
  $("team-detail").replaceChildren(
    el("h3", {}, t.name, " ", el("span", { class: "why" }, owner ? "(you're an owner)" : "")),
    el("div", { class: "row" },
      el("span", {}, "Invite link: "), el("code", { class: "invite" }, link),
      el("button", { type: "button", onclick: async (e) => {
        try {
          await navigator.clipboard.writeText(link);
          e.target.textContent = "Copied";
        } catch {
          e.target.textContent = "Copy failed";
        }
        setTimeout(() => (e.target.textContent = "Copy link"), 1500);
      } }, "Copy link"),
      owner ? el("button", { type: "button", title: "The old link stops working", onclick: () => busy($("team-msg"), async () => (await cloud.newInviteCode(ws), renderTeams())) }, "New link") : null,
    ),
    el("p", { class: "hint" }, "Anyone with the link can join after signing in, so share it only with your team."),
    el("ul", { class: "upcoming members" },
      t.members.map((m) => el("li", {},
        el("b", {}, m.name || m.email || "Member"), el("span", { class: "why" }, `${m.email ?? ""}${m.role === "owner" ? " · owner" : ""}`),
        m.user_id === t.me?.id
          ? el("button", { type: "button", class: "act", onclick: () => confirm(`Leave ${t.name}? You'll lose access to its queue.`) && busy($("team-msg"), async () => (await cloud.removeMember(ws, m.user_id), renderTeams())) }, "Leave")
          : owner ? el("button", { type: "button", class: "act", onclick: () => confirm(`Remove ${m.name || m.email} from ${t.name}?`) && busy($("team-msg"), async () => (await cloud.removeMember(ws, m.user_id), renderTeams())) }, "Remove") : null,
      )),
    ),
    el("p", {}, el("a", { href: "team.html" }, "Open the team queue →")),
  );
}

async function main() {
  const sb = await cloud.client();
  if (!sb) {
    $("lede").textContent = "PV Info works without an account: your briefing and actions stay in this browser.";
    $("off").hidden = false;
    return;
  }
  // Coming back from the emailed link, the library reads the session from the address.
  const user = await cloud.currentUser();
  cloud.team.me = user;
  cloud.markNav();
  if (!user) {
    $("lede").textContent = joinCode()
      ? "Sign in to join the team you were invited to."
      : "Sign in to keep your briefing profile, groups and actions on every device, and to share a review queue with your team.";
    $("signin").hidden = false;
    $("signin-form").addEventListener("submit", (e) => {
      e.preventDefault();
      busy($("signin-msg"), async () => {
        await cloud.signIn($("email").value.trim());
        $("signin-msg").textContent = `Check ${$("email").value.trim()} for a sign-in link. It opens this page signed in.`;
      });
    });
    return;
  }

  $("lede").textContent = "You're signed in.";
  $("me-title").textContent = `Signed in as ${user.email}`;
  $("me").hidden = false;
  $("name").value = cloud.displayName(user);
  cloud.isAdmin().then((yes) => ($("admin-link").hidden = !yes));
  cloud.onSync(renderSync);
  $("name-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy($("name-msg"), async () => {
      cloud.team.me = await cloud.saveName($("name").value.trim());
      cloud.markNav();
      $("name-msg").textContent = "Saved.";
      await cloud.loadTeam(ws);
      renderTeams();
    });
  });
  $("signout").addEventListener("click", async () => {
    await cloud.signOut();
    location.reload();
  });

  $("teams").hidden = false;
  $("create-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy($("team-msg"), async () => {
      await cloud.createTeam(ws, $("team-name").value.trim());
      $("team-name").value = "";
      renderTeams();
    });
  });
  $("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    // Accept a pasted invite link as well as the bare code.
    const raw = $("code").value.trim();
    const code = raw.match(/[?&]join=([^&#]+)/)?.[1] ?? raw;
    busy($("team-msg"), async () => {
      await cloud.joinTeam(ws, decodeURIComponent(code));
      $("code").value = "";
      renderTeams();
    });
  });

  await cloud.initCloud(ws);
  renderTeams();
}

main();
