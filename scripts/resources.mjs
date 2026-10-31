// Public Safety Data Resources, as the build publishes them. Admins maintain the
// directory on Admin → Safety data resources (supabase/schema.sql, "Safety data
// resources"); the build writes the published entries to data/resources.json, which the
// public directory page (resources.html) reads. Viewing never needs the database.
//
// Where the directory comes from, in order:
//   1. the database (with the service key; the table is readable by admins only)
//   2. if the database can't be reached, the directory the live site last published,
//      so a hiccup never brings back a retired resource
//   3. if the table has never been set up, resources.json in the repository
//
// Collection is separate: a resource never adds a feed. Whether PV Info collects from a
// resource is read from the data source registry (an active source it is linked to).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudConfig } from "./cloud.mjs";
import { publicResources, fromRow } from "../public/resources-lib.js";

export { fromRow };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = (process.env.SITE_URL || "https://pharmacovigilance-info.vercel.app").replace(/\/$/, "");
const COLUMNS = "id,name,organization,categories,specialties,countries,products,purpose,coverage,access,reuse,limitations,url,links,source_id,keywords,status,link_status,verified_on,verified_method";

const authHeaders = (key) => ({ apikey: key, ...(key.startsWith("eyJ") && { authorization: `Bearer ${key}` }) });

export async function seedResources(file = path.join(ROOT, "resources.json")) {
  return JSON.parse(await readFile(file, "utf8")).resources;
}

// The directory in the database. Returns null without a service key, and { missing: true }
// when schema.sql has not been re-run yet.
export async function fetchResources(cfg = cloudConfig(), fetchImpl = fetch) {
  if (!cfg.url || !cfg.serviceKey) return null;
  const res = await fetchImpl(`${cfg.url}/rest/v1/safety_resources?select=${COLUMNS}&order=id`, { headers: authHeaders(cfg.serviceKey), signal: AbortSignal.timeout(20000) });
  if (res.status === 404 || res.status === 400) {
    const body = await res.text();
    if (/PGRST205|42P01|does not exist|Could not find the table/i.test(body)) return { missing: true };
    throw new Error(`safety_resources HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`safety_resources HTTP ${res.status}`);
  return { rows: (await res.json()).map(fromRow) };
}

// `previous` returns the last published data/resources.json; by default read from the live site.
export async function loadResources({ cfg = cloudConfig(), fetchImpl = fetch, previous = null, seed = seedResources } = {}) {
  try {
    const live = await fetchResources(cfg, fetchImpl);
    if (live && !live.missing) return { rows: live.rows, from: "database" };
    if (live?.missing) console.warn("resources: the safety_resources table is not set up yet (run supabase/schema.sql); using resources.json");
  } catch (e) {
    console.warn(`resources: database unavailable (${e.message}); using the directory from the last build`);
    try {
      const prev = previous ? await previous() : await fetchImpl(`${SITE_URL}/data/resources.json`, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.json() : null));
      // The published file holds only published resources, already checked.
      if (prev?.resources?.length && prev.from !== "repository") return { rows: prev.resources.map((r) => ({ ...r, status: "published", sourceId: null, collectedBefore: r.collected })), from: "last build" };
    } catch {}
  }
  return { rows: await seed(), from: "repository" };
}

// Writes data/resources.json. `registry` is the data source registry the build collected
// from; a resource is shown as collected only when it is linked to one of its active sources.
export async function writeResources(dataDir, loaded, registry, now = new Date().toISOString()) {
  const activeSources = new Set((registry?.sources ?? []).filter((s) => s.status === "active").map((s) => s.id));
  const out = publicResources(loaded.rows, { activeSources, now });
  // From the last build, the source link is not in the file; keep what it said.
  if (loaded.from === "last build") {
    const before = new Map(loaded.rows.map((r) => [r.id, r.collectedBefore]));
    for (const r of out.resources) r.collected = Boolean(before.get(r.id));
  }
  await writeFile(path.join(dataDir, "resources.json"), JSON.stringify({ ...out, from: loaded.from }) + "\n");
  return out;
}
