// The optional Supabase database. When the Vercel project has the Supabase
// integration, the build (1) writes public/config.json so the site can offer
// sign-in, sync and team queues, and (2) saves every update with its impact card
// to the permanent archive. Without the environment variables both are skipped
// and the site works as before, from this browser's storage only.

import { writeFile } from "node:fs/promises";
import { impactCard } from "../public/impact.js";

const first = (env, names) => names.map((n) => env[n]).find((v) => v && v.trim())?.trim() ?? "";

// Accepts the names the Vercel Supabase integration sets, and the plain ones.
export function cloudConfig(env = process.env) {
  return {
    url: first(env, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]).replace(/\/$/, ""),
    publicKey: first(env, ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]),
    serviceKey: first(env, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"]),
  };
}

// Only the project address and the public (anon) key reach the browser; the
// policies in supabase/schema.sql decide what that key may do.
export async function writePublicConfig(file, cfg = cloudConfig()) {
  const on = Boolean(cfg.url && cfg.publicKey);
  await writeFile(file, JSON.stringify(on ? { supabaseUrl: cfg.url, supabaseKey: cfg.publicKey } : {}) + "\n");
  return on;
}

export function toRow(u, countryName) {
  return {
    id: u.id,
    title: u.title,
    link: u.link,
    summary: u.summary ?? null,
    source: u.source ?? null,
    kind: u.kind ?? null,
    country: u.country ?? null,
    region: u.region ?? null,
    agency: u.agency ?? null,
    category: u.category ?? null,
    tags: u.tags ?? [],
    priority: u.priority ?? null,
    published: u.published ?? null,
    retrieved: u.retrieved ?? null,
    impact: impactCard(u, { countryName }),
  };
}

// Legacy service_role keys are JWTs and go in Authorization too; the newer
// sb_secret_ keys go in apikey alone.
const authHeaders = (key) => ({ apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }) });

// Inserts new updates and refreshes known ones (archived_at keeps the first time).
export async function archiveUpdates(updates, { cfg = cloudConfig(), countryName = (c) => c, fetchImpl = fetch, batch = 500 } = {}) {
  if (!cfg.url || !cfg.serviceKey) return { skipped: true, saved: 0 };
  let saved = 0;
  for (let i = 0; i < updates.length; i += batch) {
    const rows = updates.slice(i, i + batch).map((u) => toRow(u, countryName));
    const res = await fetchImpl(`${cfg.url}/rest/v1/updates?on_conflict=id`, {
      method: "POST",
      headers: { ...authHeaders(cfg.serviceKey), "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`archive HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    saved += rows.length;
  }
  return { skipped: false, saved };
}
