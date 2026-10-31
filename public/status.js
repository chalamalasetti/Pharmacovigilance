// Data status page: when the updates were last refreshed and how each source did,
// from data/status.json (written by scripts/aggregate.mjs on every build).
import { ago, flag, dataHealth } from "./lib.js";

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids.filter((k) => k != null && k !== false));
  return n;
};
const time = (iso) => (iso ? el("time", { datetime: iso, title: new Date(iso).toLocaleString() }, ago(new Date(iso))) : "Not yet");

function table(id, rows, { country = true } = {}) {
  $(id).replaceChildren(
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Source"), el("th", { scope: "col" }, "Status"), el("th", { scope: "col" }, "Last successful update"))),
    el(
      "tbody",
      {},
      ...rows.map((s) =>
        el(
          "tr",
          { class: s.ok ? "" : "st-bad" },
          el("td", {}, country && s.country ? `${flag(s.country)} ` : "", s.name),
          el("td", {}, s.ok ? (s.delivery === "github-actions" ? `${s.stale || !s.collectorOk ? "⚠ Cached" : "✓ Collected"} via GitHub Actions · ${s.count} kept · Source collection ${ago(new Date(s.collectedAt))}${!s.collectorOk ? " · latest collector attempt failed" : ""}` : s.count != null ? `✓ OK · ${s.count} kept` : s.mapped != null ? `✓ OK · ${s.mapped} of ${s.records} records linked to listed companies` : "✓ OK") : s.configured === false ? "Off" : `⚠ Failed${s.error ? ` (${s.error})` : ""}${s.failingSince ? `, first failed ${ago(new Date(s.failingSince))}` : ""}`),
          el("td", {}, s.configured === false ? "" : time(s.lastSuccess)),
        ),
      ),
    ),
  );
}

async function main() {
  let status;
  try {
    const res = await fetch("data/status.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    status = await res.json();
  } catch {
    $("summary").replaceChildren(el("p", {}, "No status has been published yet. It appears after the next build."));
    return;
  }
  const { level, problems } = dataHealth(status);
  $("summary").className = `st-summary f-${level}`;
  $("summary").replaceChildren(
    el("p", { class: "st-head" }, level === "ok" ? "✓ All sources healthy" : level === "stale" ? "⚠ Data may be out of date" : "⚠ Some sources need attention"),
    el("p", {}, "Last successful update: ", el("strong", {}, time(status.updated)), " · Last rebuild: ", time(status.checked), ` · ${status.feeds.ok} of ${status.feeds.total} sources reachable`),
  );
  $("problems").hidden = !problems.length;
  $("problem-list").replaceChildren(...problems.map((p) => el("li", {}, p.text)));

  const official = status.sources.filter((s) => s.kind === "official");
  const news = status.sources.filter((s) => s.kind === "news");
  table("official", official);
  const newsBad = news.filter((s) => !s.ok);
  $("news-sum").textContent = `${news.length - newsBad.length} of ${news.length} news searches reachable at the last rebuild.${newsBad.length ? ` Failed: ${newsBad.map((s) => s.name).join(", ")}.` : ""}`;
  table("news", [...newsBad, ...news.filter((s) => s.ok)]);
  if (status.companies?.sources?.length) {
    $("companies-sec").hidden = false;
    table("companies", status.companies.sources.map((s) => (s.stale ? { ...s, error: `${s.error ?? "failed"}; earlier products kept` } : s)), { country: false });
  }
  if (status.research?.sources?.length) {
    $("research-sec").hidden = false;
    table("research", status.research.sources, { country: false });
  }
}

main();
