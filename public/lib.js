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
