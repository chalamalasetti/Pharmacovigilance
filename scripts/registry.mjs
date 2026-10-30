// Builds the public company registry: which medicines each company in
// companies/manifest.json holds, according to the FDA Orange Book and EMA's
// medicines report. Run weekly by .github/workflows/company-registry.yml, which
// commits companies/registry.json; the hourly site build only reads that file, so
// a source outage never empties a company's products.
//
//   node scripts/registry.mjs                  # download the sources
//   node scripts/registry.mjs --fixtures DIR   # read DIR/orangebook.zip and DIR/ema.xlsx instead
//
// Every product row keeps where it came from (source, record locator, URL) and the
// holder name exactly as the source gives it. Linking a holder to a company group is
// an editorial mapping (the manifest's "holders"), shown as such on the site.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unzip, readXlsx } from "./zip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = path.join(ROOT, "companies/manifest.json");
export const SOURCES = path.join(ROOT, "companies/sources.json");
export const REGISTRY = path.join(ROOT, "companies/registry.json");
export const REGISTRY_RULES = "registry-1";
const UA = "PVInfo/0.1 (+https://github.com/chalamalasetti/Pharmacovigilance)";

// ---- Names ----

// Upper case, accents and punctuation dropped: "Dr. Reddy's" -> "DR REDDYS",
// "Merck Sharp & Dohme B.V." -> "MERCK SHARP DOHME B V".
export const normName = (s) =>
  String(s ?? "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// Salt, ester and hydrate words, so "ATORVASTATIN CALCIUM TRIHYDRATE" and "atorvastatin"
// meet at the active moiety. The ingredient as listed is always kept beside it.
const SALT_WORDS = new Set(
  ("hydrochloride dihydrochloride hydrobromide hcl sodium disodium potassium calcium magnesium mesylate dimesylate maleate fumarate hemifumarate " +
    "succinate tartrate bitartrate citrate acetate sulfate sulphate phosphate besylate besilate bromide chloride tosylate dihydrate monohydrate " +
    "trihydrate hemihydrate sesquihydrate hydrate anhydrous hyclate lactate gluconate nitrate mononitrate oxalate pamoate embonate malate stearate " +
    "xinafoate furoate propionate dipropionate decanoate palmitate medoxomil erbumine tromethamine meglumine trifenatate monosodium hemisulfate " +
    "hydrogen dimeglumine olamine lysine arginine succinyl").split(" "),
);

export function moiety(name) {
  const words = String(name ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 -]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !SALT_WORDS.has(w));
  return (kept.length ? kept : words).join(" ").trim();
}

// ---- Holder -> company ----

// Matches a holder name to a company by the longest manifest prefix that fits on a
// word boundary. Two companies claiming the same prefix is a conflict, never a guess.
export function holderMatcher(manifest) {
  const pats = [];
  for (const c of manifest.companies) for (const h of c.holders ?? []) pats.push({ p: normName(h), id: c.id });
  pats.sort((a, b) => b.p.length - a.p.length);
  return (...names) => {
    for (const name of names) {
      const n = normName(name);
      if (!n) continue;
      const hits = pats.filter((x) => n === x.p || n.startsWith(`${x.p} `));
      if (!hits.length) continue;
      const ids = [...new Set(hits.filter((x) => x.p.length === hits[0].p.length).map((x) => x.id))];
      return ids.length === 1 ? { id: ids[0] } : { conflict: ids };
    }
    return null;
  };
}

// ---- FDA Orange Book ----

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function obDate(s) {
  const m = /([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/.exec(s ?? "");
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  const iso = `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return /prior/i.test(s) ? `before ${iso}` : iso;
}

// products.txt is tilde-delimited with a header row. One authorisation per application
// (NDA or ANDA number), carrying all of its strengths and forms.
export function parseOrangeBook(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim());
  const head = lines.shift().split("~").map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const at = {
    ingredient: col("ingredient"),
    form: col("df;route"),
    trade: col("trade_name"),
    applicant: col("applicant"),
    strength: col("strength"),
    type: col("appl_type"),
    no: col("appl_no"),
    date: col("approval_date"),
    market: col("type"),
    full: col("applicant_full_name"),
  };
  if (at.no < 0 || at.ingredient < 0 || at.applicant < 0) throw new Error("Orange Book products file: expected columns not found");
  const byApp = new Map();
  for (const line of lines) {
    const f = line.split("~").map((x) => x.trim());
    const key = `${f[at.type]}${f[at.no]}`;
    let a = byApp.get(key);
    if (!a) {
      const kind = f[at.type] === "A" ? "ANDA" : "NDA";
      a = {
        src: "fda-orange-book",
        market: "US",
        authId: `${kind} ${f[at.no]}`,
        brand: f[at.trade],
        ingredients: f[at.ingredient].split(";").map((s) => s.trim()).filter(Boolean),
        forms: new Set(),
        strengths: new Set(),
        holder: f[at.full] || f[at.applicant],
        applicant: f[at.applicant],
        role: "Application holder (applicant)",
        markets: new Set(),
        date: null,
        generic: kind === "ANDA",
        url: `https://www.accessdata.fda.gov/scripts/cder/ob/results_product.cfm?Appl_Type=${f[at.type]}&Appl_No=${f[at.no]}`,
        locator: `Orange Book products file, application ${kind} ${f[at.no]}`,
      };
      byApp.set(key, a);
    }
    if (f[at.form]) a.forms.add(f[at.form]);
    if (f[at.strength] && a.strengths.size < 8) a.strengths.add(f[at.strength]);
    if (f[at.market]) a.markets.add(f[at.market].toUpperCase());
    const d = obDate(f[at.date]);
    if (d && (!a.date || d.replace("before ", "") < a.date.replace("before ", ""))) a.date = d;
  }
  return [...byApp.values()].map(({ forms, strengths, markets, ...a }) => ({
    ...a,
    forms: [...forms],
    strengths: [...strengths],
    status: markets.has("RX") ? "Approved, prescription" : markets.has("OTC") ? "Approved, over the counter" : "Discontinued",
  }));
}

// ---- EMA medicines report ----

function emaDate(v) {
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return new Date(Math.round((Number(v) - 25569) * 86400000)).toISOString().slice(0, 10);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const EMA_COLUMNS = {
  category: /^category$/i,
  name: /^(name of medicine|medicine name)$/i,
  number: /product number/i,
  status: /^(medicine status|authorisation status)$/i,
  inn: /international non-proprietary name|^inn/i,
  active: /^active substance/i,
  atc: /^atc code( \(human\))?$/i,
  group: /^pharmacotherapeutic group( \(human\))?$/i,
  holder: /marketing authorisation (developer|holder)|applicant \/ holder|^company name$/i,
  maDate: /^marketing authorisation date$/i,
  generic: /^generic/i,
  biosimilar: /^biosimilar$/i,
  url: /url$/i,
};

// The report opens with a few title rows; the header is the first row naming the medicine column.
export function parseEma(rows) {
  const h = rows.findIndex((r) => r.some((c) => EMA_COLUMNS.name.test(c)));
  if (h < 0) throw new Error("EMA medicines report: header row not found");
  const head = rows[h];
  const at = Object.fromEntries(Object.entries(EMA_COLUMNS).map(([k, re]) => [k, head.findIndex((c) => re.test(c))]));
  if (at.holder < 0 || at.name < 0) throw new Error("EMA medicines report: expected columns not found");
  const get = (r, k) => (at[k] >= 0 ? (r[at[k]] ?? "").trim() : "");
  const out = [];
  for (const r of rows.slice(h + 1)) {
    const name = get(r, "name");
    if (!name) continue;
    if (at.category >= 0 && !/human/i.test(get(r, "category"))) continue;
    const status = get(r, "status") || "Unknown";
    // Refused or withdrawn applications never gave anyone an authorisation to hold.
    if (/refused|not authori[sz]ed|withdrawn application/i.test(status)) continue;
    const substances = (get(r, "inn") || get(r, "active")).split(/\s*\/\s*|\s*;\s*/).map((s) => s.trim()).filter(Boolean);
    const number = get(r, "number");
    out.push({
      src: "ema-medicines",
      market: "EU",
      authId: number || null,
      brand: name,
      ingredients: substances,
      forms: [],
      strengths: [],
      holder: get(r, "holder"),
      role: "Marketing authorisation holder",
      status,
      date: emaDate(get(r, "maDate")),
      generic: /^yes$/i.test(get(r, "generic")),
      biosimilar: /^yes$/i.test(get(r, "biosimilar")),
      ...(get(r, "atc") && { atc: get(r, "atc") }),
      ...(get(r, "group") && { group: get(r, "group") }),
      url: get(r, "url") || null,
      locator: `EMA medicines report, ${number || name}`,
    });
  }
  return out;
}

// ---- Build ----

async function download(url) {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const READERS = {
  "fda-orange-book": {
    fixture: "orangebook.zip",
    parse(buf) {
      const files = unzip(buf);
      const name = [...files.keys()].find((n) => /products\.txt$/i.test(n));
      if (!name) throw new Error("products.txt not found in the Orange Book zip");
      return parseOrangeBook(files.get(name).toString("latin1"));
    },
  },
  "ema-medicines": { fixture: "ema.xlsx", parse: (buf) => parseEma(readXlsx(buf)) },
};

// Links each source record to a company. Unlinked holders are counted so editors can
// see which large holders the manifest does not cover yet.
export function linkRecords(records, match) {
  const products = [];
  const unmapped = new Map();
  const conflicts = new Map();
  for (const r of records) {
    const m = match(r.holder, r.applicant);
    if (m?.id) {
      const { applicant, ...rest } = r;
      products.push({ company: m.id, ...rest, moieties: [...new Set(r.ingredients.map(moiety).filter(Boolean))] });
    } else if (m?.conflict) {
      conflicts.set(r.holder, m.conflict);
    } else {
      const k = `${r.src}|${r.holder}`;
      unmapped.set(k, (unmapped.get(k) ?? 0) + 1);
    }
  }
  return {
    products,
    unmapped: [...unmapped].map(([k, count]) => ({ src: k.split("|")[0], holder: k.split("|").slice(1).join("|"), count })),
    conflicts: [...conflicts].map(([holder, candidates]) => ({ holder, candidates })),
  };
}

const sortProducts = (a, b) => a.company.localeCompare(b.company) || a.src.localeCompare(b.src) || String(a.authId).localeCompare(String(b.authId)) || a.brand.localeCompare(b.brand);

export async function buildRegistry({ fixturesDir = null, out = REGISTRY, now = new Date().toISOString(), fetchImpl = download } = {}) {
  // Companies added or hidden on the Admin page count too, so their products are linked.
  // The Actions run has no database keys, so this reads what the live site last applied.
  const { applyOverlay, loadOverlay } = await import("./admin.mjs");
  const overlay = fixturesDir ? null : await loadOverlay();
  const manifest = applyOverlay(JSON.parse(await readFile(MANIFEST, "utf8")), overlay).manifest;
  const register = JSON.parse(await readFile(SOURCES, "utf8"));
  let previous = null;
  try {
    previous = JSON.parse(await readFile(out, "utf8"));
  } catch {}
  const match = holderMatcher(manifest);
  const sources = [];
  let products = [];
  let unmapped = [];
  let conflicts = [];
  for (const s of register.sources.filter((x) => x.status === "active")) {
    const prev = previous?.sources?.find((p) => p.id === s.id);
    const reader = READERS[s.id];
    try {
      const buf = fixturesDir ? await readFile(path.join(fixturesDir, reader.fixture)) : await fetchImpl(s.url);
      const records = reader.parse(buf);
      if (!records.length) throw new Error("no records parsed");
      const linked = linkRecords(records, match);
      products.push(...linked.products);
      unmapped.push(...linked.unmapped);
      conflicts.push(...linked.conflicts);
      sources.push({ id: s.id, name: s.name, ok: true, retrieved: now, lastSuccess: now, hash: createHash("sha256").update(buf).digest("hex").slice(0, 16), records: records.length, mapped: linked.products.length });
      console.log(`registry: ${s.id}: ${records.length} records, ${linked.products.length} linked to manifest companies`);
    } catch (e) {
      // Keep the last good rows for this source and say they are stale.
      const kept = (previous?.products ?? []).filter((p) => p.src === s.id);
      products.push(...kept);
      unmapped.push(...(previous?.unmapped ?? []).filter((u) => u.src === s.id));
      sources.push({ id: s.id, name: s.name, ok: false, error: String(e.message).slice(0, 160), retrieved: now, lastSuccess: prev?.lastSuccess ?? null, hash: prev?.hash ?? null, records: prev?.records ?? 0, mapped: kept.length, stale: kept.length > 0 });
      console.warn(`registry: ${s.id} FAILED (${e.message}); kept ${kept.length} rows from ${prev?.lastSuccess ?? "never"}`);
    }
  }
  products.sort(sortProducts);
  const data = {
    built: now,
    rules: REGISTRY_RULES,
    manifest: manifest.version,
    sources,
    products,
    unmapped: unmapped.sort((a, b) => b.count - a.count || a.holder.localeCompare(b.holder)).slice(0, 300),
    conflicts,
  };
  if (!products.length && !fixturesDir) throw new Error("No registry rows at all; leaving the existing registry untouched.");
  await writeFile(out, JSON.stringify(data, null, 0).replace(/\},\{"company"/g, '},\n{"company"') + "\n");
  console.log(`registry: wrote ${products.length} product rows for ${new Set(products.map((p) => p.company)).size} companies`);
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--fixtures");
  buildRegistry({ fixturesDir: i > -1 ? path.resolve(process.argv[i + 1]) : null }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
