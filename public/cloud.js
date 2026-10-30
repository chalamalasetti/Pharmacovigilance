// Sign-in, workspace sync, team queues and the update archive, through the
// optional Supabase database (tables and access rules in supabase/schema.sql).
// When the site was built without the database, client() is null and every page
// works as before from this browser's storage alone.

import * as workspace from "./workspace.js";
import { ASSESSMENT } from "./workspace.js";

const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const ARCHIVE_COLUMNS = "id,title,link,summary,source,kind,country,region,agency,category,tags,priority,published,retrieved";

let clientP = null;
export function client() {
  clientP ??= (async () => {
    const cfg = await fetch("config.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;
    const { createClient } = await import(SUPABASE_JS);
    return createClient(cfg.supabaseUrl, cfg.supabaseKey);
  })().catch((e) => {
    console.warn("PV Info database unavailable:", e);
    return null;
  });
  return clientP;
}

export async function currentUser() {
  const sb = await client();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user ?? null;
}

// Whether the signed-in reader is an app admin (supabase/schema.sql: research_admins).
export async function isAdmin() {
  const sb = await client();
  if (!sb || !(await currentUser())) return false;
  const { data, error } = await sb.rpc("is_app_admin");
  return !error && data === true;
}

export const displayName = (user) => user?.user_metadata?.name || user?.email?.split("@")[0] || "";

// Emails a one-time sign-in link that brings the reader back to the account page.
export async function signIn(email) {
  const sb = await client();
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL("account.html", location.href).href } });
  if (error) throw error;
}

export async function signOut() {
  const sb = await client();
  await sb?.auth.signOut();
}

// Saves the reader's display name on their account and on every team they are in.
export async function saveName(name) {
  const sb = await client();
  const { data, error } = await sb.auth.updateUser({ data: { name } });
  if (error) throw error;
  await sb.from("team_members").update({ name }).eq("user_id", data.user.id);
  return data.user;
}

// ── Workspace sync ───────────────────────────────────────────────────────────

export const sync = { state: "off", at: null, error: null };
const syncSubs = new Set();
export const onSync = (fn) => syncSubs.add(fn);
const setSync = (state, error = null) => {
  Object.assign(sync, { state, error, ...(state === "synced" && { at: new Date() }) });
  syncSubs.forEach((fn) => fn(sync));
};

async function push(ws, user) {
  const sb = await client();
  const at = ws.changedAt;
  const { syncedAt, ...data } = ws;
  const { error } = await sb.from("workspaces").upsert({ user_id: user.id, data, updated_at: new Date().toISOString() });
  if (error) throw error;
  ws.syncedAt = at;
  workspace.persist(ws);
}

async function pull(ws, user, onChange) {
  const sb = await client();
  const { data, error } = await sb.from("workspaces").select("data").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  const { ws: next, push: needsPush } = workspace.reconcile(ws, data?.data);
  if (next !== ws) {
    // Pages hold on to their workspace object, so refill it rather than replace it.
    for (const k of Object.keys(ws)) delete ws[k];
    Object.assign(ws, next);
    workspace.persist(ws);
    onChange?.();
  }
  if (needsPush) await push(ws, user);
}

// Pulls the synced copy, then pushes every later change a moment after it happens.
export async function startSync(ws, onChange) {
  const user = await currentUser();
  if (!user) return null;
  const run = async (fn) => {
    setSync("syncing");
    try {
      await fn();
      setSync("synced");
    } catch (e) {
      setSync("error", e);
    }
  };
  await run(() => pull(ws, user, onChange));
  let timer;
  workspace.onSave(() => {
    clearTimeout(timer);
    timer = setTimeout(() => run(() => push(ws, user)), 1200);
  });
  // Another device may have changed things while this tab was in the background.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sync.state !== "syncing") run(() => pull(ws, user, onChange));
  });
  return user;
}

// ── Teams ────────────────────────────────────────────────────────────────────

// The active team, its members and its shared queue (update id → queue item).
export const team = { id: null, name: "", code: "", role: "", me: null, list: [], members: [], items: new Map() };
const teamSubs = new Set();
export const onTeam = (fn) => teamSubs.add(fn);
const teamChanged = () => teamSubs.forEach((fn) => fn(team));

// Queue items carry a copy of the update written by a teammate's browser: keep
// only the shape the cards expect, and only web links.
export function cleanItem(r) {
  const s = r.snapshot && typeof r.snapshot === "object" ? r.snapshot : {};
  const str = (v) => (v == null ? undefined : String(v));
  const snapshot = {
    ...Object.fromEntries(["title", "summary", "source", "country", "region", "agency", "category", "kind", "published", "retrieved"].map((k) => [k, str(s[k])]).filter(([, v]) => v !== undefined)),
    id: r.update_id,
    title: str(s.title) || "Untitled update",
    link: /^https?:\/\//i.test(s.link ?? "") ? s.link : "#",
    tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
    priority: Number(s.priority) || 0,
  };
  return { ...r, snapshot };
}

export function memberName(userId) {
  if (!userId) return "someone";
  if (userId === team.me?.id) return "you";
  const m = team.members.find((x) => x.user_id === userId);
  return m ? m.name || m.email || "a teammate" : "a former member";
}

const DONE = new Set(["noaction", "notrelevant"]);
// Queue items assigned to the signed-in reader that are still open.
export const assignedToMe = () => [...team.items.values()].filter((t) => QUEUE_TABS[0].test(t, team.me?.id));

const isOpen = (t) => !t.dismissed && !DONE.has(t.assess?.status);
export const isOverdue = (t, today = new Date().toISOString().slice(0, 10)) => Boolean(t.assign?.due && t.assign.due < today && isOpen(t));

// The team queue's tabs. me is the signed-in reader's user id.
export const QUEUE_TABS = [
  { id: "mine", label: "Assigned to me", test: (t, me) => isOpen(t) && Boolean(me) && t.assign?.user_id === me },
  { id: "action", label: "Action needed", test: (t) => isOpen(t) && t.assess?.status === "action" },
  { id: "open", label: "All open", test: isOpen },
  { id: "done", label: "Closed", test: (t) => !t.dismissed && DONE.has(t.assess?.status) },
  { id: "dismissed", label: "Dismissed", test: (t) => Boolean(t.dismissed) },
];

export async function loadTeam(ws) {
  const sb = await client();
  const user = await currentUser();
  if (!sb || !user) return team;
  team.me = user;
  const { data: mine, error } = await sb.from("team_members").select("team_id, role, teams(id, name, invite_code)").eq("user_id", user.id);
  if (error) throw error;
  team.list = mine.filter((m) => m.teams).map((m) => ({ id: m.team_id, name: m.teams.name, code: m.teams.invite_code, role: m.role }));
  const active = team.list.find((t) => t.id === ws.team) ?? team.list[0] ?? null;
  Object.assign(team, { id: active?.id ?? null, name: active?.name ?? "", code: active?.code ?? "", role: active?.role ?? "", members: [], items: new Map() });
  if (team.id) {
    const [m, i] = await Promise.all([
      sb.from("team_members").select("user_id, email, name, role, joined_at").eq("team_id", team.id).order("joined_at"),
      sb.from("team_items").select("*").eq("team_id", team.id).order("updated_at", { ascending: false }).limit(2000),
    ]);
    if (m.error) throw m.error;
    if (i.error) throw i.error;
    team.members = m.data;
    team.items = new Map(i.data.map((r) => [r.update_id, cleanItem(r)]));
  }
  teamChanged();
  return team;
}

export async function setActiveTeam(ws, id) {
  ws.team = id;
  workspace.save(ws);
  return loadTeam(ws);
}

const rpc = async (fn, args) => {
  const sb = await client();
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
};

export async function createTeam(ws, name) {
  const id = await rpc("create_team", { team_name: name, member_name: displayName(await currentUser()) });
  return setActiveTeam(ws, id);
}

export async function joinTeam(ws, code) {
  const id = await rpc("join_team", { code, member_name: displayName(await currentUser()) });
  return setActiveTeam(ws, id);
}

export async function newInviteCode(ws) {
  await rpc("new_invite_code", { t: team.id });
  return loadTeam(ws);
}

// Leaving (userId is the reader) or, for an owner, removing a member.
export async function removeMember(ws, userId) {
  const sb = await client();
  const { error } = await sb.from("team_members").delete().eq("team_id", team.id).eq("user_id", userId);
  if (error) throw error;
  if (userId === team.me?.id) delete ws.team;
  return loadTeam(ws);
}

export const inviteLink = (code) => new URL(`account.html?join=${encodeURIComponent(code)}`, location.href).href;

// Records an assessment, assignment or dismissal (or clears one: null) on the
// team queue. The database stamps who and when, and logs it in the audit trail.
export async function teamAction(u, patch) {
  if (!team.id) return null;
  const sb = await client();
  const fields = { snapshot: workspace.snapshot(u) };
  for (const k of ["assess", "assign", "dismissed"]) if (k in patch) fields[k] = patch[k] ? { ...patch[k], by: team.me.id } : null;
  const q = team.items.has(u.id)
    ? sb.from("team_items").update(fields).eq("team_id", team.id).eq("update_id", u.id)
    : sb.from("team_items").upsert({ team_id: team.id, update_id: u.id, ...fields });
  const { data, error } = await q.select().single();
  if (error) throw error;
  team.items.set(u.id, cleanItem(data));
  teamChanged();
  return team.items.get(u.id);
}

export async function teamEvents(limit = 50) {
  if (!team.id) return [];
  const sb = await client();
  const { data, error } = await sb.from("team_events").select("*").eq("team_id", team.id).order("at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

const day = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

// One line for a card: where the update stands in the team queue.
export function teamSummary(t) {
  const parts = [];
  if (t.assess) parts.push(`${ASSESSMENT.find((a) => a.id === t.assess.status)?.label ?? "Assessed"} (${memberName(t.assess.by)}, ${day(t.assess.at)})${t.assess.note ? `: ${t.assess.note}` : ""}`);
  if (t.assign) parts.push(`assigned to ${t.assign.to}${t.assign.due ? `, due ${day(t.assign.due)}` : ""}${t.assign.note ? `: ${t.assign.note}` : ""}`);
  if (t.dismissed) parts.push(`dismissed by ${memberName(t.dismissed.by)}: ${t.dismissed.reason}${t.dismissed.note ? ` (${t.dismissed.note})` : ""}`);
  return parts.join(" · ") || "in the queue";
}

// ── Archive ──────────────────────────────────────────────────────────────────

export async function searchArchive({ q = "", country = "", cat = "", kind = "", from = "", to = "", offset = 0, limit = 50 } = {}) {
  const sb = await client();
  let query = sb.from("updates").select(ARCHIVE_COLUMNS, { count: "exact" }).order("published", { ascending: false, nullsFirst: false }).range(offset, offset + limit - 1);
  if (q.trim()) query = query.textSearch("fts", q.trim(), { type: "websearch", config: "simple" });
  if (country) query = query.eq("country", country);
  if (cat) query = query.contains("tags", [cat]);
  if (kind) query = query.eq("kind", kind);
  if (from) query = query.gte("published", `${from}T00:00:00Z`);
  if (to) query = query.lte("published", `${to}T23:59:59Z`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { updates: data, count };
}

export async function archiveStats() {
  const sb = await client();
  const [all, oldest] = await Promise.all([
    sb.from("updates").select("id", { count: "exact", head: true }),
    sb.from("updates").select("published").not("published", "is", null).order("published", { ascending: true }).limit(1),
  ]);
  return { count: all.count ?? 0, since: oldest.data?.[0]?.published ?? null };
}

// ── Page wiring ──────────────────────────────────────────────────────────────

// Shows who is signed in and how many open items are assigned to them in the
// top links of the page.
export function markNav() {
  const acct = document.querySelector('[data-nav="account"]');
  if (acct) acct.textContent = team.me ? `👤 ${displayName(team.me)}` : "Sign in";
  const link = document.querySelector('[data-nav="team"]');
  if (link) {
    const n = assignedToMe().length;
    link.textContent = n ? `Team (${n})` : "Team";
    link.title = n ? `${n} open item${n === 1 ? "" : "s"} assigned to you` : "";
  }
}

// For pages with update cards: sync the workspace and load the team queue when
// the reader is signed in. onChange redraws the page with the synced data.
export async function initCloud(ws, onChange) {
  if (!(await client())) return null;
  const user = await startSync(ws, onChange);
  team.me = user;
  if (user) {
    try {
      await loadTeam(ws);
      onChange?.();
    } catch (e) {
      console.warn("PV Info team queue unavailable:", e);
    }
  }
  markNav();
  onTeam(markNav);
  return user;
}

// For pages without update cards: just show who is signed in.
export async function navOnly() {
  if (await client()) team.me = await currentUser();
  markNav();
}
