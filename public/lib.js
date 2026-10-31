// Pure helpers shared by the page and the tests.

export const REGIONS = ["International", "Americas", "Europe", "Asia-Pacific", "Middle East & Africa"];

// Regional-indicator flag for a two-letter code (EU has one too); a globe for international bodies.
export function flag(code) {
  if (!/^[A-Z]{2}$/.test(code || "")) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function ago(date, now = Date.now()) {
  const mins = Math.round((now - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function dayLabel(date, now = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - d) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const fold = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Whether an update passes the current filters. Every word in the search must appear
// somewhere in the title, summary, source, agency or country code.
export function matches(u, f) {
  if (f.region && u.region !== f.region) return false;
  if (f.country && u.country !== f.country) return false;
  if (f.followed && !f.followed.includes(u.country)) return false;
  if (f.cat && !u.tags.includes(f.cat)) return false;
  if (f.kind && u.kind !== f.kind) return false;
  if (f.days && u.published && (f.now ?? Date.now()) - Date.parse(u.published) > Number(f.days) * 86400000) return false;
  if (f.q) {
    const hay = fold(`${u.title} ${u.summary ?? ""} ${u.source} ${u.agency ?? ""} ${u.country}`);
    if (!fold(f.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}

// The handful worth reading first: highest priority (official notices and safety, recall,
// label, regulation or guideline changes), then newest, at most two per country
// so one busy regulator doesn't fill the strip.
export function keyUpdates(updates, n = 6) {
  const perCountry = new Map();
  const out = [];
  const sorted = [...updates].sort((a, b) => b.priority - a.priority || (b.published ?? "").localeCompare(a.published ?? ""));
  for (const u of sorted) {
    if (u.priority < 4) break;
    const k = perCountry.get(u.country) ?? 0;
    if (k >= 2) continue;
    perCountry.set(u.country, k + 1);
    out.push(u);
    if (out.length === n) break;
  }
  return out;
}

// ---- Data freshness ----
// Shared by the status strip on every page, the Data status page and the hourly
// health check that opens a GitHub issue. The site rebuilds every hour, so two missed
// rebuilds in a row is a problem. A single failed fetch is shown on the site straight
// away but only raises an alert once it has lasted a while, so one slow hour stays quiet.
export const FRESHNESS = {
  staleAfterMs: 3 * 3600000,
  officialAlertAfterMs: 6 * 3600000,
  newsAlertShare: 0.5,
  researchAlertAfterMs: 24 * 3600000,
  // Any registry source that has failed this many hourly runs in a row alerts on its own.
  repeatAlertRuns: 6,
};

// level: "ok", "warn" (something failed, data is still current) or "stale" (no fresh data).
// Each problem says whether it is worth alerting the maintainer about.
export function dataHealth(status, now = Date.now(), t = FRESHNESS) {
  const problems = [];
  const age = (iso) => (iso ? now - Date.parse(iso) : Infinity);
  const hours = (ms) => (ms === Infinity ? "ever" : `${Math.round(ms / 3600000)} h`);
  if (!status) return { level: "stale", problems: [{ text: "No data status has been published yet.", alert: true }] };

  const sinceCheck = age(status.checked ?? status.updated);
  const sinceData = age(status.updated);
  let stale = false;
  if (sinceCheck > t.staleAfterMs) {
    stale = true;
    problems.push({ text: `The site has not rebuilt for ${hours(sinceCheck)}. The hourly refresh or the build may be failing.`, alert: true });
  } else if (sinceData > t.staleAfterMs) {
    stale = true;
    problems.push({ text: `No source has been reachable for ${hours(sinceData)}, so updates shown are from the last successful refresh.`, alert: true });
  }

  const sources = status.sources ?? [];
  for (const s of sources.filter((s) => s.kind === "official" && !s.ok)) {
    const down = age(s.failingSince ?? status.checked);
    problems.push({
      text: `${s.name} could not be reached${down > t.staleAfterMs ? ` for ${hours(down)}` : " at the last refresh"}${s.error ? ` (${s.error})` : ""}. Its earlier updates are still shown.`,
      alert: down >= t.officialAlertAfterMs,
      source: s.id,
    });
  }
  for (const s of sources.filter(s => s.delivery === "github-actions" && (s.stale || s.collectorOk === false))) {
    const elapsed = age(s.collectedAt);
    problems.push({ text:`${s.name} is served from an aging regulator snapshot (${hours(elapsed)} old)${s.collectorOk === false ? "; the latest collector attempt failed" : ""}. Original regulator links remain available.`, alert:elapsed >= t.officialAlertAfterMs, source:s.id });
  }
  const news = sources.filter((s) => s.kind === "news");
  const newsDown = news.filter((s) => !s.ok);
  if (newsDown.length) {
    problems.push({
      text: `${newsDown.length} of ${news.length} news searches failed at the last refresh.`,
      alert: newsDown.length / news.length >= t.newsAlertShare,
    });
  }
  for (const s of newsDown.filter((s) => (s.failures ?? 0) >= t.repeatAlertRuns)) {
    problems.push({ text: `${s.name} has failed ${s.failures} collections in a row${s.error ? ` (${s.error})` : ""}. It stays active; fix or pause it on Admin → Data sources.`, alert: true, source: s.id });
  }
  for (const s of (status.research?.sources ?? []).filter((s) => s.configured && !s.ok)) {
    const down = age(s.lastSuccess);
    problems.push({
      text: `Research source ${s.name} failed at its last refresh${s.lastSuccess ? `; last success ${hours(down)} ago` : ""}${s.error ? ` (${s.error})` : ""}.`,
      alert: down >= t.researchAlertAfterMs,
    });
  }
  return { level: stale ? "stale" : problems.length ? "warn" : "ok", problems };
}
