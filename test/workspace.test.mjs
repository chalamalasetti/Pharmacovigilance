import { test } from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
const ws = await import("../public/workspace.js");

test("workspace starts from followed countries and saves item records", () => {
  mem.set("pv-follow", JSON.stringify(["IN"]));
  const w = ws.load();
  assert.deepEqual(w.profile.countries, ["IN"]);
  ws.update(w, "a", { saved: true });
  ws.update(w, "a", { assess: { status: "action", note: "Check SmPC", at: "2026-10-30T00:00:00Z" } });
  assert.deepEqual(Object.keys(ws.load().items.a).sort(), ["assess", "saved"]);
  assert.match(ws.reviewStatus(ws.load().items.a), /Reviewed by you 2026-10-30: Relevant: action needed/);
  ws.update(w, "a", { saved: null, assess: null });
  assert.equal(ws.load().items.a, undefined);
});

test("export, import and CSV round trip", () => {
  const w = ws.load();
  ws.update(w, "b", { dismissed: { reason: "Other", note: "Vet product, \"not ours\"", at: "2026-10-30T00:00:00Z" } });
  const other = { version: 1, profile: { role: "", countries: [], topics: [], watch: [] }, items: {} };
  ws.importJson(other, ws.exportJson(w));
  assert.equal(other.items.b.dismissed.reason, "Other");
  assert.throws(() => ws.importJson(other, "{}"));
  const csv = ws.exportCsv(w, [{ id: "b", title: "T", link: "L" }]);
  assert.match(csv, /"Vet product, ""not ours"""/);
});
