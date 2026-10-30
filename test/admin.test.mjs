import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOverlay, adminSummary, cleanFields, fetchOverlay, loadOverlay } from "../scripts/admin.mjs";

const manifest = JSON.parse(readFileSync(new URL("../companies/manifest.json", import.meta.url), "utf8"));
const at = "2026-10-31T09:00:00Z";

test("no admin changes leaves the manifest as it is", () => {
  const r = applyOverlay(manifest, null);
  assert.deepEqual(r.manifest, manifest);
  assert.deepEqual(r.problems, []);
});

test("an approval of this version approves the list; another version's does not", () => {
  const ok = applyOverlay(manifest, { approvals: [{ version: manifest.version, status: "approved", approved_by: "Venkat", approved_on: "2026-10-31" }] });
  assert.equal(ok.manifest.status, "approved");
  assert.equal(ok.manifest.approvedBy, "Venkat");
  assert.equal(ok.manifest.approvedOn, "2026-10-31");
  const old = applyOverlay(manifest, { approvals: [{ version: "2025-01-01.1", status: "approved", approved_by: "Venkat", approved_on: "2025-01-01" }] });
  assert.equal(old.manifest.status, manifest.status);
  const withdrawn = applyOverlay({ ...manifest, status: "approved", approvedBy: "X" }, { approvals: [{ version: manifest.version, status: "draft" }] });
  assert.equal(withdrawn.manifest.status, "draft");
  assert.equal(withdrawn.manifest.approvedBy, null);
});

test("admins add, edit and hide companies over the repo file", () => {
  const r = applyOverlay(manifest, {
    overrides: [
      { company_id: "acme-pharma", data: { name: "Acme Pharma", country: "us", region: "Americas", types: ["generics"], holders: ["Acme Pharma Inc."] }, updated_at: at },
      { company_id: "pfizer", data: { aliases: ["Pfizer Inc"], mentions: ["Pfizer", "Hospira"] }, updated_at: at },
      { company_id: "merck-kgaa", data: {}, hidden: true },
    ],
  });
  const acme = r.manifest.companies.find((c) => c.id === "acme-pharma");
  assert.equal(acme.country, "US");
  assert.deepEqual(acme.mentions, ["Acme Pharma"], "a new company is matched by its name unless mentions are given");
  assert.deepEqual(acme.holders, ["ACME PHARMA INC"], "holders are normalised like the registry's");
  const pfizer = r.manifest.companies.find((c) => c.id === "pfizer");
  assert.deepEqual(pfizer.mentions, ["Pfizer", "Hospira"]);
  assert.ok(pfizer.holders.includes("WYETH"), "fields an admin did not change keep the repo value");
  assert.ok(!r.manifest.companies.some((c) => c.id === "merck-kgaa"));
  assert.ok(!r.manifest.companies.find((c) => c.id === "merck-co").distinctFrom?.includes("merck-kgaa"), "links to a hidden company are dropped");
  assert.ok(!r.manifest.ambiguous.find((a) => a.term === "Merck").candidates.includes("merck-kgaa"));
  assert.deepEqual(r.applied, { approval: null, added: ["acme-pharma"], edited: ["pfizer"], hidden: ["merck-kgaa"] });
  assert.equal(manifest.companies.find((c) => c.id === "pfizer").mentions.length, 1, "the repo manifest object is not changed");

  const s = adminSummary({ base: manifest, result: r, overlay: { from: "database", fetched: at, approvals: [], overrides: [] }, now: at });
  assert.equal(s.manifest.companies, manifest.companies.length);
  assert.equal(s.from, "database");
  assert.deepEqual(s.hidden, [{ id: "merck-kgaa", name: "Merck KGaA (EMD)" }]);
  assert.equal(s.companies.find((c) => c.id === "acme-pharma").added, true);
  assert.ok(s.regions.includes("Europe"));
});

test("a change the build cannot use is skipped and reported, not guessed", () => {
  const r = applyOverlay(manifest, {
    overrides: [
      { company_id: "half-done", data: { name: "Half Done" } },
      { company_id: "pfizer", data: { region: "Atlantis", mentions: ["Pf", "Pfizer"] } },
      { company_id: "Bad Id", data: { name: "x" } },
    ],
  });
  assert.ok(!r.manifest.companies.some((c) => c.id === "half-done"));
  assert.ok(r.problems.some((p) => p.id === "half-done" && /needs a country/.test(p.problem)));
  assert.ok(r.problems.some((p) => p.id === "pfizer" && /Atlantis/.test(p.problem)));
  assert.deepEqual(r.manifest.companies.find((c) => c.id === "pfizer").mentions, ["Pfizer"], "a too-short mention is left out");
  assert.equal(r.manifest.companies.find((c) => c.id === "pfizer").region, "Americas");
  assert.ok(r.problems.some((p) => p.id === "Bad Id"));
});

test("field checks trim, de-duplicate and cap lists", () => {
  const { fields } = cleanFields({ aliases: [" A ", "A", "", 5, ...Array.from({ length: 60 }, (_, i) => `n${i}`)], name: "  X  " }, { regions: new Set(), isNew: false });
  assert.equal(fields.name, "X");
  assert.equal(fields.aliases[0], "A");
  assert.equal(fields.aliases.length, 40);
});

test("the build reads public columns from the database, and falls back to the last build", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => (url.includes("manifest_approvals") ? [{ version: "v1", status: "approved" }] : [{ company_id: "acme", data: {} }]) };
  };
  const o = await fetchOverlay({ url: "https://x.supabase.co", publicKey: "anon", serviceKey: "" }, fetchImpl);
  assert.equal(o.approvals[0].version, "v1");
  assert.ok(calls.every((c) => c.init.headers.apikey === "anon"));
  assert.ok(!calls.some((c) => /by_email/.test(c.url)), "admin emails are never read for the site");
  assert.equal(await fetchOverlay({ url: "", publicKey: "", serviceKey: "" }, fetchImpl), null);

  const down = async () => ({ ok: false, status: 503 });
  const prev = { overlay: { fetched: at, approvals: [{ version: "v1", status: "approved" }], overrides: [] } };
  const kept = await loadOverlay({ cfg: { url: "https://x.supabase.co", publicKey: "anon" }, fetchImpl: down, previous: async () => prev });
  assert.equal(kept.from, "last build");
  assert.equal(kept.approvals[0].status, "approved");
  assert.equal(await loadOverlay({ cfg: { url: "", publicKey: "" }, fetchImpl: down, previous: async () => null }), null);
});
