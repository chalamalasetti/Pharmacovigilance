// Public homepage presentation rules. No model calls or private profile data.
import { dataHealth, FRESHNESS, keyUpdates } from "./lib.js";
export const DEFAULT_FILTERS = {
  q: "",
  region: "",
  country: "",
  cat: "",
  kind: "",
  days: "30",
  mine: "",
  co: "",
};
export const webLink = (value) => {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
};
export const validDate = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
export function dateLabel(value) {
  return validDate(value)
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Date not supplied";
}
export function excerpt(update, max = 240) {
  const s = String(update.summary ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.toLowerCase() === String(update.title ?? "").toLowerCase())
    return null;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
export function homepageData(raw) {
  if (
    !raw ||
    !Array.isArray(raw.updates) ||
    !Array.isArray(raw.countries) ||
    !Array.isArray(raw.categories)
  )
    throw Error("Published feed is unavailable");
  const countries = raw.countries.filter(
      (c) => c && typeof c.code === "string" && typeof c.country === "string",
    ),
    categories = raw.categories.filter(
      (c) => c && typeof c.id === "string" && typeof c.label === "string",
    );
  if (!countries.length || !categories.length)
    throw Error("Published feed is incomplete");
  const updates = raw.updates
    .filter(
      (u) =>
        u &&
        typeof u.id === "string" &&
        typeof u.title === "string" &&
        u.title.trim() &&
        typeof u.country === "string" &&
        webLink(u.link),
    )
    .map((u) => ({
      ...u,
      link: webLink(u.link),
      source: String(u.source ?? "Source not supplied"),
      kind: u.kind === "official" ? "official" : "news",
      published: validDate(u.published),
      tags: Array.isArray(u.tags) ? u.tags : [u.category],
      priority: Number.isFinite(u.priority) ? u.priority : 0,
    }));
  if (raw.updates.length && !updates.length)
    throw Error("Published feed is incomplete");
  return {
    ...raw,
    updated: validDate(raw.updated),
    checked: validDate(raw.checked),
    countries,
    categories,
    updates,
  };
}
export function feedHealth(data, status, now = Date.now()) {
  const updated = validDate(data?.updated),
    sameSnapshot = !!updated && validDate(status?.updated) === updated;
  const detailed =
    sameSnapshot && Array.isArray(status?.sources)
      ? { ...status, research: undefined }
      : null;
  const feeds =
    data?.feeds &&
    Number.isInteger(data.feeds.total) &&
    Number.isInteger(data.feeds.ok) &&
    data.feeds.total >= data.feeds.ok &&
    data.feeds.ok >= 0
      ? data.feeds
      : null;
  const checked = validDate(data?.checked),
    stale = !updated || now - Date.parse(updated) > FRESHNESS.staleAfterMs;
  const health = detailed ? dataHealth({ ...detailed, updated }, now) : null;
  const level = stale
    ? "stale"
    : health?.level === "stale"
      ? "stale"
      : health?.level === "warn" || (feeds && feeds.ok < feeds.total)
        ? "warn"
        : detailed && health?.level === "ok"
          ? "ok"
          : "unknown";
  const latest =
    data?.updates
      ?.map((u) => validDate(u.published))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  return {
    level,
    updated,
    checked,
    latest,
    feeds,
    title:
      level === "stale"
        ? "Snapshot may be out of date"
        : level === "warn"
          ? "Some sources need attention"
          : level === "ok"
            ? "Latest source checks completed"
            : "Detailed source status unavailable",
    note:
      level === "stale"
        ? "Earlier updates remain available. Check source status before relying on freshness."
        : level === "warn"
          ? "Unavailable or aging sources may leave gaps. Earlier updates are retained."
          : !detailed
            ? "Source details could not be matched to this snapshot. Check the status page for the latest results."
            : "Sources are scheduled for hourly checks. Publication times and source availability vary.",
  };
}
export function coverageSummary(coverage) {
  if (!coverage || !Array.isArray(coverage.sources)) return null;
  const direct = [
    ...new Set(
      coverage.sources
        .filter((s) => s.classification === "regulator")
        .map((s) => s.organization || s.name)
        .filter(Boolean),
    ),
  ];
  const news = coverage.sources.filter(
    (s) => s.classification === "news",
  ).length;
  return { direct, news, total: coverage.sources.length };
}
export function feedbackLink(update = null) {
  const url = new URL(
    "https://github.com/chalamalasetti/Pharmacovigilance/issues/new",
  );
  url.searchParams.set(
    "title",
    update
      ? "Update correction: " + String(update.title).slice(0, 100)
      : "Missing or incorrect PV Info update",
  );
  url.searchParams.set(
    "body",
    [
      "Please describe the missing item or correction using public information only.",
      "Do not include patient details, private company assessments or other personal information.",
      "",
      ...(update
        ? [
            "Update ID: " + update.id,
            "Title: " + update.title,
            "Source: " + (webLink(update.link) ?? "not supplied"),
            "Publication date: " +
              (validDate(update.published) ?? "not supplied"),
            "",
          ]
        : []),
      "Official supporting link: ",
      "What needs attention: ",
    ].join("\n"),
  );
  return url.href;
}

export function priorityPicks(updates, now = Date.now()) {
  return keyUpdates(
    updates.filter(
      (u) =>
        validDate(u.published) &&
        now - Date.parse(u.published) >= 0 &&
        now - Date.parse(u.published) <= 7 * 86400000 &&
        !/^(?:what['’]?s new(?: related to drugs| for biologics)?|news and press releases|newsroom)[?.!]?$/i.test(
          u.title.trim(),
        ),
    ),
    3,
  );
}
export function agencyName(update) {
  if (update.agency)
    return update.agency === "HC" ? "Health Canada" : update.agency;
  const source = String(update.source ?? "");
  for (const [pattern, name] of [
    [/\bFDA\b/i, "FDA"],
    [/\bEMA\b/i, "EMA"],
    [/\bMHRA\b/i, "MHRA"],
    [/Health Canada/i, "Health Canada"],
    [/\bWHO\b/i, "WHO"],
  ])
    if (pattern.test(source)) return name;
  return null;
}

export function coverageLine(coverage) {
  if (!coverage?.direct?.length)
    return "See the source list for configured regulators and secondary news coverage.";
  return (
    "Direct feeds: " +
    coverage.direct
      .map((name) => name.match(/\(([A-Z][A-Z0-9-]{1,12})\)/)?.[1] ?? name)
      .join(" · ") +
    ". Additional agency coverage comes from filtered news and varies."
  );
}
