// Matches updates and research papers to companies in the registry, with a plain
// reason for every match. Deterministic rules only (no AI), versioned by MATCH_RULES so
// a stored match says which rules made it.
//
// Lanes, strongest first (the specification's lanes A, B, C and F; D and E need a
// private portfolio and come later):
//   direct     names an authorisation number, or a brand the company holds
//   substance  names an active substance the company holds a sourced product for
//   class      names a drug class the company holds a sourced product in (indirect)
//   corporate  names the company, with no product link found (off by default on the site)
//
// Confidence is a label, never a percentage: "Direct identifier match", "Supported
// relationship", "Possible match — review required", "Topic relevance", "Company mentioned".

import { moiety, normName } from "./registry.mjs";

export const MATCH_RULES = "match-1";

export const LABELS = {
  id: "Direct identifier match",
  supported: "Supported relationship",
  possible: "Possible match — review required",
  topic: "Topic relevance",
  mention: "Company mentioned",
};

// Drug classes named in safety notices, with member substances (INNs). A class match is
// indirect: the notice may concern other members of the class.
export const CLASSES = [
  { id: "glp1", label: "GLP-1 receptor agonists", re: /\bGLP-1( receptor)? (agonist|RA)s?\b|\bGLP-1 (medicines|drugs|therapies)\b/i, members: ["semaglutide", "liraglutide", "dulaglutide", "exenatide", "lixisenatide", "tirzepatide", "albiglutide"] },
  { id: "sglt2", label: "SGLT2 inhibitors", re: /\bSGLT-?2 inhibitors?\b|\bgliflozins?\b/i, members: ["dapagliflozin", "empagliflozin", "canagliflozin", "ertugliflozin", "sotagliflozin"] },
  { id: "dpp4", label: "DPP-4 inhibitors", re: /\bDPP-?4 inhibitors?\b|\bgliptins?\b/i, members: ["sitagliptin", "saxagliptin", "linagliptin", "alogliptin", "vildagliptin"] },
  { id: "jak", label: "JAK inhibitors", re: /\bJAK inhibitors?\b|\bJanus kinase inhibitors?\b/i, members: ["tofacitinib", "baricitinib", "upadacitinib", "filgotinib", "abrocitinib", "ruxolitinib", "ritlecitinib"] },
  { id: "tnf", label: "TNF inhibitors", re: /\b(anti-)?TNF(-alpha)? (inhibitors?|blockers?|agents?)\b/i, members: ["adalimumab", "infliximab", "etanercept", "certolizumab pegol", "golimumab"] },
  { id: "pd1", label: "PD-1 / PD-L1 inhibitors", re: /\bPD-L?1 inhibitors?\b|\bimmune checkpoint inhibitors?\b|\bcheckpoint inhibitors?\b/i, members: ["nivolumab", "pembrolizumab", "cemiplimab", "dostarlimab", "atezolizumab", "durvalumab", "avelumab", "tislelizumab", "toripalimab"] },
  { id: "cart", label: "CAR-T cell therapies", re: /\bCAR[- ]T\b|\bchimeric antigen receptor\b/i, members: ["tisagenlecleucel", "axicabtagene ciloleucel", "brexucabtagene autoleucel", "lisocabtagene maraleucel", "idecabtagene vicleucel", "ciltacabtagene autoleucel"] },
  { id: "fluoroquinolone", label: "Fluoroquinolones", re: /\bfluoroquinolones?\b|\bquinolone antibiotics?\b/i, members: ["ciprofloxacin", "levofloxacin", "moxifloxacin", "ofloxacin", "norfloxacin", "delafloxacin"] },
  { id: "sartan", label: "Sartans (angiotensin II receptor blockers)", re: /\bsartans?\b|\bangiotensin (II )?receptor blockers?\b|\bARBs\b/i, members: ["valsartan", "losartan", "irbesartan", "candesartan", "olmesartan", "telmisartan", "azilsartan"] },
  { id: "statin", label: "Statins", re: /\bstatins?\b/i, members: ["atorvastatin", "rosuvastatin", "simvastatin", "pravastatin", "lovastatin", "fluvastatin", "pitavastatin"] },
  { id: "ssri", label: "SSRIs", re: /\bSSRIs?\b|\bselective serotonin reuptake inhibitors?\b/i, members: ["fluoxetine", "sertraline", "paroxetine", "citalopram", "escitalopram", "fluvoxamine"] },
  { id: "ppi", label: "Proton pump inhibitors", re: /\bproton pump inhibitors?\b|\bPPIs\b/i, members: ["omeprazole", "esomeprazole", "lansoprazole", "pantoprazole", "rabeprazole", "dexlansoprazole"] },
  { id: "doac", label: "Direct oral anticoagulants", re: /\bDOACs?\b|\bdirect oral anticoagulants?\b|\bNOACs?\b/i, members: ["apixaban", "rivaroxaban", "edoxaban", "dabigatran etexilate", "dabigatran"] },
  { id: "opioid", label: "Opioids", re: /\bopioids?\b/i, members: ["oxycodone", "hydrocodone", "morphine", "fentanyl", "buprenorphine", "tramadol", "tapentadol", "methadone", "hydromorphone", "oxymorphone", "codeine"] },
  { id: "gnrh", label: "GnRH analogues", re: /\bGnRH (agonists?|analogues?|antagonists?)\b/i, members: ["leuprorelin", "leuprolide", "goserelin", "triptorelin", "degarelix", "relugolix"] },
  { id: "isotretinoin", label: "Oral retinoids", re: /\b(oral )?retinoids?\b/i, members: ["isotretinoin", "acitretin", "alitretinoin"] },
];

// Single words that are ingredients but say nothing about a company's product.
const STOP_SUBSTANCES = new Set(
  "water oxygen alcohol ethanol glycerin dextrose glucose sodium potassium calcium magnesium iron zinc insulin heparin vitamin vaccine saline nitrogen helium lactose sucrose".split(" "),
);
// Brands that are everyday words, so a headline using the word is not about the medicine.
const COMMON_BRAND_WORDS = new Set(
  ("advance balance bright care clear complete control focus guard prime relief restore secure simple smart solo spark sure total trust unity vital " +
    "alert active beyond boost bridge clarity comfort covid daily ease fresh harmony health hope journey liberty matrix motion nexus nova " +
    "origin pulse quest rapid serene shield signal sterile summit swift today united vision").split(" "),
);

const EU_CODES = new Set(["EU", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"]);
export const marketOf = (country) => (country === "US" ? "US" : EU_CODES.has(country) ? "EU" : null);
const MARKET_NAMES = { US: "the US", EU: "the EU" };
// Orange Book names are upper case: "SYNTHEX" reads better as "Synthex".
export const pretty = (s) => String(s ?? "").replace(/\b([A-Z])([A-Z]{2,})\b/g, (_, a, b) => a + b.toLowerCase());
const listMarkets = (ms) => [...ms].sort().map((m) => MARKET_NAMES[m] ?? m).join(" and ");

// Words joined by single spaces, lower case: the form every term and text is compared in.
const tokens = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
export const termKey = (s) => tokens(s).join(" ");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentionRe = (phrase) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "u");

const authKey = (s) => normName(s).replace(/\s+/g, "");

// Everything the matcher needs, built once per build from the manifest and the registry.
export function buildIndex(manifest, registry) {
  const companies = new Map(manifest.companies.map((c) => [c.id, c]));
  const products = (registry?.products ?? []).filter((p) => companies.has(p.company));
  const allMoieties = new Set(products.flatMap((p) => p.moieties ?? []));

  // term -> company -> { kind, markets, n, names }
  const brands = new Map();
  const substances = new Map();
  const auth = new Map();
  const add = (map, key, company, market, name) => {
    if (!map.has(key)) map.set(key, new Map());
    const byCo = map.get(key);
    if (!byCo.has(company)) byCo.set(company, { markets: new Set(), n: 0, names: new Set() });
    const e = byCo.get(company);
    e.markets.add(market);
    e.n++;
    if (name) e.names.add(name);
  };
  for (const p of products) {
    for (const m of p.moieties ?? []) {
      const k = termKey(m);
      if (k.length < 5 || STOP_SUBSTANCES.has(k)) continue;
      add(substances, k, p.company, p.market, m);
    }
    const b = termKey(p.brand);
    if (b.length >= 5 && !allMoieties.has(moiety(p.brand)) && !COMMON_BRAND_WORDS.has(b) && !/^\d/.test(b)) add(brands, b, p.company, p.market, p.brand);
    if (p.authId) auth.set(authKey(p.authId), p);
  }
  const mentions = manifest.companies.flatMap((c) => (c.mentions ?? []).map((m) => ({ id: c.id, phrase: m, re: mentionRe(m) })));
  // Which class members each company holds.
  const classHoldings = new Map();
  for (const cl of CLASSES) {
    for (const mem of cl.members) {
      for (const [co, e] of substances.get(termKey(mem)) ?? []) {
        const key = `${co}|${cl.id}`;
        if (!classHoldings.has(key)) classHoldings.set(key, { members: new Set(), markets: new Set() });
        classHoldings.get(key).members.add(mem);
        for (const mk of e.markets) classHoldings.get(key).markets.add(mk);
      }
    }
  }
  const longest = Math.max(1, ...[...brands.keys(), ...substances.keys()].map((k) => k.split(" ").length));
  return { companies, products, brands, substances, auth, mentions, classHoldings, longest: Math.min(longest, 6) };
}

const AUTH_RE = [/\bEMEA\/H\/C\/\d{6}\b/g, /\b(?:A?NDA)\s*(?:No\.?\s*|#\s*)?\d{6}\b/g];

// Matches one text. `country` is where the notice comes from; `kind` is "update" or
// "paper", which changes the wording (research never establishes fault or causality).
export function matchText(idx, text, { country = null, kind = "update", countryName = (c) => c } = {}) {
  const words = tokens(text);
  const foundBrands = new Map();
  const foundSubs = new Map();
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= idx.longest && i + n <= words.length; n++) {
      const k = words.slice(i, i + n).join(" ");
      if (idx.brands.has(k)) foundBrands.set(k, idx.brands.get(k));
      if (idx.substances.has(k)) foundSubs.set(k, idx.substances.get(k));
    }
  }
  const mentioned = new Map();
  for (const m of idx.mentions) if (!mentioned.has(m.id) && m.re.test(text)) mentioned.set(m.id, m.phrase);
  const ids = [];
  for (const re of AUTH_RE) for (const m of String(text).matchAll(re)) ids.push(m[0]);
  const classes = CLASSES.filter((c) => c.re.test(text));

  const market = marketOf(country);
  const where = (markets) => {
    if (!country || country === "INT") return null;
    if (market && markets.has(market)) return null;
    return `Notice from ${countryName(country)}; the sourced relationship covers ${listMarkets(markets)} only. Outside the markets mapped so far, so local applicability is not established.`;
  };
  const research = kind === "paper" ? " Research mentioning a substance does not establish company fault or product causality." : "";
  const out = new Map();
  const put = (id, m) => {
    if (!out.has(id)) out.set(id, m);
  };

  for (const raw of ids) {
    const p = idx.auth.get(authKey(raw));
    if (!p) continue;
    put(p.company, { id: p.company, lane: "direct", label: LABELS.id, terms: [raw], markets: [p.market], reason: `Names authorisation ${p.authId} (${pretty(p.brand)}), held by ${p.holder} in ${MARKET_NAMES[p.market] ?? p.market} according to ${p.src === "ema-medicines" ? "EMA" : "FDA"} records.` });
  }
  // A brand held by more than one company, with none of them named, is left for the substance rules.
  for (const byCo of foundBrands.values()) {
    const unique = byCo.size === 1;
    for (const [co, e] of byCo) {
      const name = pretty([...e.names][0]);
      const c = idx.companies.get(co);
      if (mentioned.has(co)) {
        put(co, { id: co, lane: "direct", label: LABELS.supported, terms: [name, mentioned.get(co)], markets: [...e.markets], reason: `Names ${name} and ${c.name}; ${c.name} holds ${name} in ${listMarkets(e.markets)} according to the registry.` });
      } else if (unique) {
        put(co, { id: co, lane: "direct", label: LABELS.possible, terms: [name], markets: [...e.markets], reason: `Names ${name}, a brand ${c.name} holds in ${listMarkets(e.markets)}. The company is not named, and brand names can identify different products in other markets.` });
      }
    }
  }
  for (const [k, byCo] of foundSubs) {
    for (const [co, e] of byCo) {
      const c = idx.companies.get(co);
      const others = byCo.size - 1;
      put(co, {
        id: co,
        lane: "substance",
        label: LABELS.supported,
        terms: [k],
        markets: [...e.markets],
        reason: `Substance matched: ${k}. ${c.name} holds ${e.n} sourced authorisation${e.n > 1 ? "s" : ""} containing it in ${listMarkets(e.markets)}${others ? `; ${others} other compan${others > 1 ? "ies in the registry also hold" : "y in the registry also holds"} it` : ""}.${research}`,
      });
    }
  }
  for (const cl of classes) {
    for (const [key, h] of idx.classHoldings) {
      const [co, cid] = key.split("|");
      if (cid !== cl.id) continue;
      const c = idx.companies.get(co);
      put(co, { id: co, lane: "class", label: LABELS.topic, terms: [cl.label], markets: [...h.markets], reason: `Class matched: ${cl.label}. ${c.name} holds sourced products in this class (${[...h.members].join(", ")}). Indirect: the ${kind === "paper" ? "paper" : "notice"} may concern other members of the class.${research}` });
    }
  }
  for (const [co, phrase] of mentioned) {
    put(co, { id: co, lane: "corporate", label: LABELS.mention, terms: [phrase], markets: [], reason: `Mentions ${phrase} by name; no link to a product in the registry was found.` });
  }
  return [...out.values()].map((m) => {
    const note = m.lane === "corporate" ? null : where(new Set(m.markets));
    return { ...m, ...(note && { outside: note }) };
  });
}

export const updateText = (u) => `${u.title}. ${u.summary ?? ""}`;
export const paperText = (p) =>
  [p.title, (p.keywords ?? []).join(" "), ...(p.summary ?? []).map((s) => s.text), ...Object.values(p.sections ?? {}).flat().map((s) => s.text), p.abstract ?? ""].join(" ");
