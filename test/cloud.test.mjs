import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cloudConfig, writePublicConfig, toRow, archiveUpdates } from "../scripts/cloud.mjs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const ws = await import("../public/workspace.js");
const cloud = await import("../public/cloud.js");

const u = { id: "abc", title: "PRAC recommends new measures for valproate", link: "https://ema.example/v", summary: "Effective from 1 March 2027.", source: "EMA", kind: "official", country: "EU", region: "Europe", category: "safety", tags: ["safety"], priority: 8, published: "2026-10-29T10:00:00Z" };

test("database settings come from the Vercel Supabase integration's variables", () => {
  const cfg = cloudConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co/", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "eyJsecret" });
  assert.deepEqual(cfg, { url: "https://x.supabase.co", publicKey: "anon", serviceKey: "eyJsecret" });
  assert.equal(cloudConfig({}).url, "");
});

test("only the public key is written for the browser", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pv-"));
  const file = path.join(dir, "config.json");
  assert.equal(await writePublicConfig(file, { url: "https://x.supabase.co", publicKey: "anon", serviceKey: "secret" }), true);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { supabaseUrl: "https://x.supabase.co", supabaseKey: "anon" });
  assert.equal(await writePublicConfig(file, { url: "", publicKey: "", serviceKey: "" }), false);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), {});
});

test("archive rows carry the impact card and go up in batches", async () => {
  const row = toRow(u, () => "European Union");
  assert.equal(row.impact.affected.jurisdictions[0], "European Union");
  assert.ok(row.impact.dates.some((d) => d.type === "effective"));
  const calls = [];
  const fetchImpl = async (url, init) => (calls.push({ url, init }), { ok: true });
  const r = await archiveUpdates([u, { ...u, id: "def" }, { ...u, id: "ghi" }], { cfg: { url: "https://x.supabase.co", serviceKey: "sb_secret_1" }, fetchImpl, batch: 2 });
  assert.deepEqual(r, { skipped: false, saved: 3 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/updates?on_conflict=id");
  assert.equal(calls[0].init.headers.apikey, "sb_secret_1");
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.match(calls[0].init.headers.prefer, /merge-duplicates/);
  assert.deepEqual((await archiveUpdates([u], { cfg: { url: "", serviceKey: "" } })).skipped, true);
  await assert.rejects(archiveUpdates([u], { cfg: { url: "https://x", serviceKey: "eyJ" }, fetchImpl: async () => ({ ok: false, status: 401, text: async () => "bad key" }) }), /401/);
});

const base = (extra) => ({ version: 1, profile: { role: "", countries: [], topics: [], watch: [] }, items: {}, lastVisit: null, ...extra });

test("sync: the side that changed wins, so removals stick", () => {
  // Only this browser changed: keep it and push.
  let r = ws.reconcile(base({ changedAt: "2026-10-30T10:05:00Z", syncedAt: "2026-10-30T10:00:00Z", items: {} }), base({ changedAt: "2026-10-30T10:00:00Z", items: { a: { saved: true, savedAt: "2026-10-30T09:00:00Z" } } }));
  assert.deepEqual(r.ws.items, {});
  assert.equal(r.push, true);
  // Only the other device changed: take its copy as is.
  r = ws.reconcile(base({ changedAt: "2026-10-30T10:00:00Z", syncedAt: "2026-10-30T10:00:00Z", items: { a: { saved: true } }, lastVisit: "2026-10-30T11:00:00Z" }), base({ changedAt: "2026-10-30T10:30:00Z", items: {}, profile: { role: "qppv", countries: ["IN"], topics: [], watch: [] } }));
  assert.deepEqual(r.ws.items, {});
  assert.equal(r.ws.profile.role, "qppv");
  assert.equal(r.ws.syncedAt, "2026-10-30T10:30:00Z");
  assert.equal(r.ws.lastVisit, "2026-10-30T11:00:00Z");
  assert.equal(r.push, false);
  // Nothing new anywhere.
  r = ws.reconcile(base({ changedAt: "2026-10-30T10:00:00Z", syncedAt: "2026-10-30T10:00:00Z" }), base({ changedAt: "2026-10-30T10:00:00Z" }));
  assert.equal(r.push, false);
  // First sign-in on a new account: push what this browser has.
  assert.equal(ws.reconcile(base({}), null).push, true);
});

test("sync: both changed, items merge newest first and the profile follows the later change", () => {
  const local = base({ changedAt: "2026-10-30T10:20:00Z", syncedAt: "2026-10-30T10:00:00Z", profile: { role: "ops", countries: [], topics: [], watch: [] }, items: { a: { assess: { status: "open", at: "2026-10-30T10:10:00Z" } }, b: { saved: true, savedAt: "2026-10-30T10:15:00Z" } } });
  const remote = base({ changedAt: "2026-10-30T10:25:00Z", profile: { role: "safety", countries: [], topics: [], watch: [] }, items: { a: { assess: { status: "action", at: "2026-10-30T10:12:00Z" } }, c: { followed: true, followedAt: "2026-10-30T10:01:00Z" } } });
  const r = ws.reconcile(local, remote, "2026-10-30T10:30:00Z");
  assert.deepEqual(Object.keys(r.ws.items).sort(), ["a", "b", "c"]);
  assert.equal(r.ws.items.a.assess.status, "action");
  assert.equal(r.ws.profile.role, "safety");
  // The merged copy is newer than both, so the other device picks it up next time.
  assert.equal(r.ws.changedAt, "2026-10-30T10:30:00Z");
  assert.equal(r.push, true);
});

test("saving stamps a change and tells the sync; persisting does not", () => {
  const w = ws.load();
  let told = 0;
  ws.onSave(() => told++);
  ws.persist(w);
  assert.equal(told, 0);
  ws.update(w, "x", { saved: true });
  assert.equal(told, 1);
  assert.ok(w.changedAt);
});

test("team queue items are cleaned, and tabs sort them", () => {
  const item = cloud.cleanItem({ update_id: "u1", snapshot: { title: "T", link: "javascript:alert(1)", tags: "safety", priority: "x" }, assess: { status: "action" }, updated_at: "2026-10-30T10:00:00Z" });
  assert.equal(item.snapshot.link, "#");
  assert.deepEqual(item.snapshot.tags, []);
  assert.equal(item.snapshot.id, "u1");
  assert.equal(cloud.cleanItem({ update_id: "u2", snapshot: null }).snapshot.title, "Untitled update");

  const me = "user-1";
  const tab = (id) => cloud.QUEUE_TABS.find((t) => t.id === id).test;
  const mine = { assign: { user_id: me, due: "2026-10-01" } };
  assert.equal(tab("mine")(mine, me), true);
  assert.equal(tab("mine")({ ...mine, assess: { status: "noaction" } }, me), false);
  assert.equal(tab("mine")({ assign: { to: "Raj" } }, me), false);
  assert.equal(tab("action")({ assess: { status: "action" } }), true);
  assert.equal(tab("done")({ assess: { status: "notrelevant" } }), true);
  assert.equal(tab("open")({ dismissed: { reason: "Other" } }), false);
  assert.equal(tab("dismissed")({ dismissed: { reason: "Other" } }), true);
  assert.equal(cloud.isOverdue(mine, "2026-10-30"), true);
  assert.equal(cloud.isOverdue({ ...mine, dismissed: {} }, "2026-10-30"), false);
});

test("a queue line says who did what", () => {
  cloud.team.me = { id: "me" };
  cloud.team.members = [{ user_id: "p", name: "Priya" }];
  const line = cloud.teamSummary({ assess: { status: "action", by: "p", at: "2026-10-29T10:00:00Z", note: "Check SmPC" }, assign: { to: "Raj", due: "2026-11-05" } });
  assert.match(line, /^Relevant: action needed \(Priya, .*\): Check SmPC · assigned to Raj, due /);
  assert.equal(cloud.memberName("me"), "you");
  assert.equal(cloud.memberName("gone"), "a former member");
});
